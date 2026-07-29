import {
  CLAUDE_PDF_VISION_MAX_BYTES,
  selectClaudeVisionFiles,
  visionFileKey,
  type ClaudeVisionSelection,
} from "@/lib/ai/anthropic-request";
import { extractJsonContent } from "@/lib/ai/extract-json";
import { parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import { extractPdfPages, splitPdfIntoChunks } from "@/lib/pdf/split-pdf";
import { buildManualContextText } from "@/lib/manual/reference-manual";
import type { EvaluationContext } from "@/lib/evaluation-context";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload-limits";
import { callClaude, ClaudePayloadTooLargeError, type ClaudeContentBlock } from "./claude-call";
import { selectRelevantPagesForBatch } from "./relevant-pages";
import { addUsage, type UsageByModel } from "./usage-cost";
import {
  normalizeChecklistStatus,
  type ChecklistEvidence,
  type ChecklistFinding,
  type ChecklistItem,
  type ChecklistLawRef,
  type ChecklistSourcePage,
  type EvidenceRegion,
} from "./types";

const EVALUATE_MAX_OUTPUT_TOKENS = 16_384;
/**
 * 배치당 항목 수. 한때 25로 늘려 배치 수(=PDF 재전송 비용)를 줄여봤으나,
 * 한 번의 응답에서 더 많은 항목을 한 번에 판정하게 되면서 응답이 길어질수록
 * 회차 간 판정 편차(충족/부분충족 경계 판정이 뒤바뀌는 현상)가 커지는
 * 부작용이 확인됨. 회차별 개선 추이 비교가 이 기능의 핵심 가치이므로
 * 비용보다 일관성을 우선해 15로 되돌림.
 */
const ITEMS_PER_BATCH = 15;
/** 항목당 예상 출력 토큰 — 잘림(max_tokens)이 판정 누락·회차 간 편차를 만들므로 여유 있게 */
const OUTPUT_TOKENS_PER_ITEM = 480;
const OUTPUT_TOKENS_BASE = 1_500;

/** 대용량 PDF 분할 구간당 최대 용량 (구간마다 별도 요청이므로 요청 한도만 지키면 됨) */
export const CHUNK_MAX_BYTES = 15 * 1024 * 1024;
/** 분할 구간당 최대 페이지 (Anthropic 요청당 100페이지 한도 내) */
const CHUNK_MAX_PAGES = 90;
/**
 * 파일당 최대 분석 구간 수 — 페이지 관련도 필터링이 불가능한 경우(스캔본 등)의 폴백에서만
 * 사용됨. 예전엔 6(=15MB×6=90MB)으로 고정돼 있어, 앱이 업로드를 허용하는 최대 용량
 * (MAX_UPLOAD_FILE_BYTES=100MB)보다 낮았음 — 텍스트 레이어 없는 100MB 근처 스캔 문서를
 * 올리면 뒷부분이 경고만 남긴 채 조용히 분석에서 빠지는 실제 재현 가능한 버그였음.
 * 앱이 실제로 허용하는 업로드 상한을 항상 커버하도록 동적으로 계산하고(페이지 크기 편차에
 * 대비해 여유분 +2 구간 추가), 업로드 상한이 나중에 바뀌어도 이 값이 자동으로 따라가게 함.
 */
export const MAX_CHUNKS_PER_FILE = Math.ceil(MAX_UPLOAD_FILE_BYTES / CHUNK_MAX_BYTES) + 2;

/**
 * 페이지 관련도 필터링 on/off 스위치. 배치마다 문서 전체를 재전송하는 대신, 그 배치의
 * 항목과 관련성 높은 페이지만 추출해 보냅니다 (텍스트 레이어 기반 키워드 매칭 — 근거를
 * 놓칠 정확도 리스크가 있음을 감수하고 비용을 크게 줄이기 위한 선택). 문제가 발견되면
 * 이 값을 false로 바꿔 기존(전체 문서 재전송) 방식으로 즉시 되돌릴 수 있습니다.
 */
const ENABLE_PAGE_RELEVANCE_FILTERING = true;

const STATUS_RANK: Record<ChecklistFinding["status"], number> = {
  충족: 3,
  부분충족: 2,
  미충족: 1,
  확인불가: 0,
};

function resolveMaxOutputTokens(itemCount: number): number {
  return Math.min(EVALUATE_MAX_OUTPUT_TOKENS, OUTPUT_TOKENS_BASE + itemCount * OUTPUT_TOKENS_PER_ITEM);
}

const EVALUATE_SYSTEM_PROMPT = `당신은 경관·공공디자인 사전 심의를 보조하는 검토관입니다.
제출 문서(도면·조감도·이미지·본문 포함)를 근거로 체크리스트 항목별 충족 여부를 판정합니다.

판정 기준 (배점 없음):
- "충족": 문서에서 항목 요구사항이 반영된 명확한 근거(도면·본문·이미지)를 확인함
- "부분충족": 일부만 반영되었거나 근거가 불완전함
- "미충족": 요구사항이 반영되지 않았음을 확인함
- "확인불가": 제출 문서만으로는 판단할 수 없음 (근거 부재)

규칙:
- 반드시 문서에서 실제로 확인한 내용만 근거로 사용합니다. 추측·일반론 금지.
- 판정 일관성: 같은 문서·같은 항목에는 항상 같은 판정이 나와야 합니다. 경계가 모호하면 "문서에 명시적 근거가 있는가"를 유일한 기준으로 삼습니다 — 명확한 근거 있음=충족, 근거가 일부만 있음=부분충족, 반영되지 않았음이 확인됨=미충족, 근거 자체가 없음=확인불가.
- evidence의 fileName·page는 실제로 근거를 확인한 페이지만 기재합니다. 도면·이미지 속 글자도 근거로 인정합니다.
- 공간정보(경관지구·용도지역·문화재)가 판단에 실제로 영향을 준 경우에만 rationale에 반영합니다.
- lawRefs는 아래 '조회된 법령·지침' 목록에 있는 것만 인용합니다. 목록에 없는 법령은 절대 언급하지 않습니다.
- '심의 매뉴얼 발췌'가 제공되면 판정 기준·보완 방향의 근거로 우선 참조합니다. 매뉴얼 기준을 인용할 때는 rationale·recommendation에 "매뉴얼 p.N" 형식으로 출처를 표기합니다. 발췌에 없는 내용을 매뉴얼 출처로 지어내지 않습니다.
- 도면의 치수·수치·축척은 문서에서 숫자를 명확히 판독한 경우에만 근거로 사용합니다. 축소·저해상도로 숫자가 불명확하면 추정하지 말고 "확인불가"로 판정하고 rationale에 판독 불가 사실을 밝힙니다.
- "미충족"·"부분충족" 항목에는 구체적인 보완 방향(recommendation)을 제시합니다.
- 간결하게 씁니다: rationale은 2문장 이내, evidence는 항목당 최대 2개(note는 60자 이내), recommendation은 1~2문장.
- 문체 통일: summary·rationale·note·recommendation 등 모든 서술은 개조식 명사형 종결("~함", "~됨", "~임", "~필요", "~확인")로 작성합니다. "~합니다/~했습니다/~있다" 같은 서술형 종결은 사용하지 않습니다. (예: "배치도 p.12에서 차폐 조경 확인됨", "야간 조명 계획 보완 필요")
- 반드시 JSON만 출력합니다.`;

export type EvaluateItemsResult = {
  findings: ChecklistFinding[];
  items: ChecklistItem[];
  checklistPages: ChecklistSourcePage[];
  summary: string;
  model: string;
  usedVision: boolean;
  warnings: string[];
  usageByModel: UsageByModel;
};

/** 조회된 법령·공간정보를 프롬프트 텍스트로 요약합니다. */
export function buildContextText(context: EvaluationContext): string {
  const parts: string[] = [];

  if (context.spatial) {
    const zones =
      context.spatial.matchedZones.length > 0
        ? context.spatial.matchedZones
            .map((zone) => `${zone.name}(${zone.jurisdiction}${zone.designationYear ? `, ${zone.designationYear}` : ""})`)
            .join(", ")
        : "해당 없음";
    const nearby =
      (context.spatial.nearbyFeatures ?? [])
        .map((feature) => `${feature.layerLabel}: ${feature.name}`)
        .join(", ") || "조회된 정보 없음";
    parts.push(
      `[공간정보 (브이월드)]\n주소: ${context.spatial.address}\n경관지구 해당: ${context.spatial.inLandscapeZone ? "예" : "아니오"}\n관련 구역: ${zones}\n인접 공간정보(용도지역·문화재 등): ${nearby}`,
    );
  }

  const laws = context.referenceLaws.slice(0, 12);
  if (laws.length > 0) {
    parts.push(
      `[조회된 법령·지침 (국가법령정보센터)]\n${laws
        .map((law) => `- ${law.title} ${law.article}: ${law.summary.slice(0, 160)}`)
        .join("\n")}`,
    );
  }

  const guidelines = context.referenceGuidelines.slice(0, 8);
  if (guidelines.length > 0) {
    parts.push(
      `[행정규칙·별표]\n${guidelines
        .map((guide) => `- ${guide.title} ${guide.section}: ${guide.summary.slice(0, 120)}`)
        .join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

/**
 * 파일별 선별 결과에 따라 비전(문서·이미지)과 텍스트 블록을 섞어 구성합니다.
 * selection이 null이면 텍스트 전용 모드입니다.
 * pageFilter가 주어지면(파일명 -> 원본 페이지 번호 목록) 해당 PDF는 그 페이지만 추출해
 * 전송합니다 — 배치별 관련 페이지만 재전송해 비용을 줄이는 용도입니다. 추출에 실패하면
 * 안전하게 전체 문서로 폴백합니다.
 * shouldCache가 true일 때만 마지막 블록에 cache_control을 붙입니다 — 같은 문서를
 * 다시 쓸 일이 없는 단일 호출에 캐시 마커를 붙이면 쓰기 프리미엄(약 25%)만 물게 되므로,
 * 실제로 재사용될 때만(배치가 2개 이상 등) 캐싱을 활성화합니다.
 */
async function buildDocumentBlocks(
  files: UploadedFileSummary[],
  selection: ClaudeVisionSelection | null,
  shouldCache = true,
  pageFilter?: Map<string, number[]>,
): Promise<{ blocks: ClaudeContentBlock[]; pageMaps: Array<{ fileName: string; mapping: number[] }> }> {
  const blocks: ClaudeContentBlock[] = [];
  const pageMaps: Array<{ fileName: string; mapping: number[] }> = [];

  for (const file of files) {
    const includeVision = selection?.includedKeys.has(visionFileKey(file)) ?? false;

    if (includeVision) {
      for (const asset of file.visionAssets ?? []) {
        if (asset.mediaType === "application/pdf") {
          const allowedPages = pageFilter?.get(file.originalName);
          let usedFiltered = false;

          if (allowedPages && allowedPages.length > 0) {
            try {
              const extracted = await extractPdfPages(asset.base64, allowedPages);
              if (extracted) {
                blocks.push({
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: extracted.base64 },
                  title: `${file.originalName} (관련 페이지 발췌 ${extracted.pages.length}p)`,
                });
                pageMaps.push({ fileName: file.originalName, mapping: extracted.pages });
                usedFiltered = true;
              }
            } catch {
              // 추출 실패 시 아래에서 전체 문서로 폴백
            }
          }

          if (!usedFiltered) {
            blocks.push({
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: asset.base64 },
              title: file.originalName,
            });
          }
        } else {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: asset.mediaType, data: asset.base64 },
          });
        }
      }
      continue;
    }

    const text = (file.extractedTextPreview ?? "").trim();
    if (text) {
      blocks.push({ type: "text", text: `=== 제출 문서: ${file.originalName} ===\n${text}` });
    }
  }

  // 배치 호출 시 문서 페이로드 재사용 (prompt caching) — 재사용이 예상될 때만 마킹
  if (shouldCache) {
    const last = blocks[blocks.length - 1];
    if (last) last.cache_control = { type: "ephemeral" };
  }

  return { blocks, pageMaps };
}

/**
 * 요청 1건에 담기는 문서 페이로드 그룹.
 * - chunk: 대용량 PDF를 연속 구간으로 분할한 폴백 경로에서 사용 (페이지 관련도 필터링이
 *   불가능할 때 — 텍스트 레이어 없음 등).
 * - pageMaps: 페이지 관련도 필터링이 적용된 파일들의 로컬(첨부본 내) -> 원본 페이지 매핑.
 *   같은 배치 안에서도 파일별로 필터링 여부가 다를 수 있어 배열로 관리합니다.
 */
export type DocumentPayload = {
  blocks: ClaudeContentBlock[];
  chunk?: { fileName: string; startPage: number; endPage: number };
  pageMaps?: Array<{ fileName: string; mapping: number[] }>;
};

function payloadHasVision(payload: DocumentPayload): boolean {
  return payload.blocks.some((block) => block.type !== "text");
}

function chunkNote(chunk: NonNullable<DocumentPayload["chunk"]>): string {
  return `[주의] 첨부된 「${chunk.fileName}」 문서는 원본의 일부 구간(원본 p.${chunk.startPage}~p.${chunk.endPage})만 담고 있습니다.
- 페이지 인용 시 첨부 문서에서 보이는 페이지 번호(1부터 시작)를 그대로 기재하세요. 원본 페이지 번호로는 시스템이 변환합니다.
- 이 구간에서 근거를 찾지 못한 항목은 "확인불가"로 판정하세요. 다른 구간에서 별도로 평가됩니다.`;
}

function relevantPagesNote(fileName: string, pageCount: number): string {
  return `[주의] 첨부된 「${fileName}」 문서는 전체 중 이 배치의 항목과 관련성이 높다고 판단된 ${pageCount}개 페이지만
발췌한 것입니다 (전체가 아닙니다).
- 페이지 인용 시 첨부 문서에서 보이는 페이지 번호(1부터 시작)를 그대로 기재하세요. 원본 페이지 번호로는 시스템이 변환합니다.
- 이 발췌본에서 근거를 찾지 못했다고 해서 원본 전체에 근거가 없다고 단정하지 말고, 발췌 범위 내 확인 결과만 근거로 삼아 신중히 판정하세요.`;
}

/**
 * 용량·페이지 한도로 제외된 파일들을 연속 구간으로 분할해 폴백 페이로드로 만듭니다.
 * 페이지 관련도 필터링(관련 페이지만 직접 추출)이 불가능한 경우에만 사용되는 경로입니다
 * (텍스트 레이어가 없는 스캔본 등). 호출 비용이 있으므로 평가 단계 진입 전 한 번만 계산해
 * 배치마다 재사용합니다.
 */
async function buildChunkFallbackPayloads(
  files: UploadedFileSummary[],
  excluded: ClaudeVisionSelection["excluded"],
  warnings: string[],
): Promise<DocumentPayload[]> {
  const chunkPayloads: DocumentPayload[] = [];

  for (const entry of excluded) {
    const file = files.find((candidate) => candidate.originalName === entry.fileName);
    const pdfAsset = file?.visionAssets?.find((asset) => asset.mediaType === "application/pdf");
    if (!file || !pdfAsset) {
      warnings.push(`"${entry.fileName}"은(는) 비전 분석에서 제외하고 텍스트만 사용했습니다 (${entry.reason}).`);
      continue;
    }

    try {
      const chunks = await splitPdfIntoChunks(pdfAsset.base64, {
        maxBytesPerChunk: CHUNK_MAX_BYTES,
        maxPagesPerChunk: CHUNK_MAX_PAGES,
      });
      const limited = chunks.slice(0, MAX_CHUNKS_PER_FILE);
      if (limited.length === 0) {
        throw new Error("분할 결과가 비어 있습니다.");
      }

      for (const chunk of limited) {
        chunkPayloads.push({
          blocks: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: chunk.base64 },
              title: file.originalName,
              cache_control: { type: "ephemeral" },
            },
          ],
          chunk: { fileName: file.originalName, startPage: chunk.startPage, endPage: chunk.endPage },
        });
      }

      const dropped = chunks.length - limited.length;
      warnings.push(
        `"${file.originalName}"이(가) 요청 한도를 넘어(${entry.reason}) ${limited.length}개 구간으로 나눠 분석했습니다.` +
          (dropped > 0
            ? ` 뒷부분(원본 p.${limited[limited.length - 1].endPage + 1}~)은 구간 수 한도로 분석에서 제외됐습니다.`
            : ""),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      warnings.push(
        `"${entry.fileName}"은(는) 비전 분석에서 제외하고 텍스트만 사용했습니다 (${entry.reason}; 구간 분할 실패: ${message}).`,
      );
    }
  }

  return chunkPayloads;
}

/**
 * 문서 페이로드 그룹들을 구성합니다: 한도 내 파일들의 기본 그룹 + 미리 계산된 구간 분할 폴백
 * 그룹들. 체크리스트 항목을 아직 모르는 단계(비전 추출)에서 사용하므로 페이지 필터링은
 * 적용하지 않습니다.
 */
async function buildDocumentPayloads(
  files: UploadedFileSummary[],
  selection: ClaudeVisionSelection,
  chunkPayloads: DocumentPayload[],
  shouldCacheBase = true,
): Promise<DocumentPayload[]> {
  const payloads: DocumentPayload[] = [];
  const built = await buildDocumentBlocks(files, selection, shouldCacheBase);
  const base: DocumentPayload = { blocks: built.blocks };
  let chunks = chunkPayloads;

  // 기본 그룹에 비전이 없으면 그 텍스트를 첫 구간에 합쳐 호출 수를 줄입니다.
  if (!payloadHasVision(base) && chunks.length > 0) {
    chunks = [{ ...chunks[0], blocks: [...base.blocks, ...chunks[0].blocks] }, ...chunks.slice(1)];
  } else if (base.blocks.length > 0) {
    payloads.push(base);
  }

  payloads.push(...chunks);
  return payloads;
}

/**
 * 평가 배치 1개에 대해, 항목과 관련성 높은 페이지만 담은 문서 페이로드를 구성합니다.
 * - 기본 포함 파일(용량 내): 관련 페이지만 추출해 재전송 — 배치마다 전체 PDF를 다시 보내던
 *   기존 방식 대비 재전송 페이지 수만큼 비용이 줄어듭니다.
 * - 용량 초과로 제외된 파일: 텍스트 레이어가 있으면 원본 전체에서 관련 페이지를 직접 추출해
 *   (구간 분할 없이) 한 번에 보냅니다 — 원본이 수백 페이지라도 배치당 수십 페이지만
 *   전송되므로, 앞부분 몇 구간만 보고 뒷부분이 통째로 잘리던 기존 구간 분할의 한계가
 *   사실상 사라집니다. 텍스트 레이어가 없거나(스캔본) 추출 실패·용량 초과 시에는
 *   미리 계산해 둔 구간 분할 폴백(chunkFallbackPayloads)을 그대로 사용합니다.
 * ENABLE_PAGE_RELEVANCE_FILTERING이 false면 필터링 없이 기존 동작(전체 문서 + 구간 폴백)을
 * 그대로 수행합니다.
 */
async function buildBatchDocumentPayloads(
  files: UploadedFileSummary[],
  selection: ClaudeVisionSelection,
  batchItems: ChecklistItem[],
  checklistPages: ChecklistSourcePage[],
  chunkFallbackPayloads: DocumentPayload[],
): Promise<DocumentPayload[]> {
  if (!ENABLE_PAGE_RELEVANCE_FILTERING) {
    const built = await buildDocumentBlocks(files, selection, false);
    const payloads: DocumentPayload[] = [];
    if (built.blocks.length > 0) payloads.push({ blocks: built.blocks });
    payloads.push(...chunkFallbackPayloads);
    return payloads;
  }

  const { pagesByFile, skippedFiles } = selectRelevantPagesForBatch(files, batchItems, checklistPages);

  const pageFilter = new Map<string, number[]>();
  for (const [fileName, pages] of pagesByFile) {
    if (!skippedFiles.has(fileName)) pageFilter.set(fileName, pages);
  }

  const built = await buildDocumentBlocks(files, selection, false, pageFilter);
  const payloads: DocumentPayload[] = [];
  if (built.blocks.length > 0) {
    payloads.push({ blocks: built.blocks, pageMaps: built.pageMaps.length > 0 ? built.pageMaps : undefined });
  }

  for (const entry of selection.excluded) {
    const file = files.find((candidate) => candidate.originalName === entry.fileName);
    const pdfAsset = file?.visionAssets?.find((asset) => asset.mediaType === "application/pdf");
    const relevantPages = pagesByFile.get(entry.fileName);
    const canFilter = Boolean(file && pdfAsset && relevantPages && relevantPages.length > 0 && !skippedFiles.has(entry.fileName));

    let handled = false;
    if (canFilter && file && pdfAsset && relevantPages) {
      try {
        const extracted = await extractPdfPages(pdfAsset.base64, relevantPages);
        if (extracted && extracted.sizeBytes <= CLAUDE_PDF_VISION_MAX_BYTES) {
          payloads.push({
            blocks: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: extracted.base64 },
                title: `${file.originalName} (관련 페이지 발췌 ${extracted.pages.length}p / 전체 ${file.totalPages ?? "?"}p)`,
              },
            ],
            pageMaps: [{ fileName: file.originalName, mapping: extracted.pages }],
          });
          handled = true;
        }
      } catch {
        // 아래에서 구간 분할 폴백으로 처리
      }
    }

    if (!handled) {
      payloads.push(...chunkFallbackPayloads.filter((payload) => payload.chunk?.fileName === entry.fileName));
    }
  }

  return payloads;
}

const VISION_EXTRACT_SYSTEM = `당신은 경관·공공디자인 심의 문서에서 체크리스트를 찾아 항목을 추출하는 도구입니다.
규칙:
- '체크리스트' 제목이 있는 페이지(표 형태의 점검 항목)를 찾습니다. 목차 페이지는 제외합니다.
- 항목 원문을 최대한 그대로 보존합니다 (요약·의역 금지). 머리말·열 제목(반영여부·비고 등)·범례는 제외합니다.
- 반드시 JSON만 출력합니다.`;

function buildVisionExtractPrompt(projectLabel: string, note?: string): string {
  return `${projectLabel}
${note ? `\n${note}\n` : ""}
첨부 문서에서 '체크리스트' 페이지를 찾아 표의 점검 항목을 추출하세요.
출력 형식(JSON만):
{"checklistPages":[{"fileName":"파일명","page":5}],"items":[{"category":"구분","text":"항목 원문","fileName":"파일명","page":5}]}
체크리스트 페이지가 없으면 {"checklistPages":[],"items":[]}만 출력하세요.`;
}

function findPageMapping(
  pageMaps: Array<{ fileName: string; mapping: number[] }> | undefined,
  fileName: string,
): number[] | undefined {
  if (!pageMaps || pageMaps.length === 0) return undefined;
  const exact = pageMaps.find((entry) => entry.fileName === fileName);
  if (exact) return exact.mapping;
  return pageMaps.find((entry) => entry.fileName.includes(fileName) || fileName.includes(entry.fileName))?.mapping;
}

/**
 * 첨부본(구간 분할 또는 페이지 관련도 필터링)의 로컬 페이지 번호를 원본 페이지 번호로
 * 변환합니다.
 * - chunk(연속 구간 분할): 파일명을 원본명으로 고정하고 오프셋을 더합니다.
 * - pageMaps(페이지 관련도 필터링): 응답의 fileName으로 해당 파일의 매핑 배열을 찾아
 *   로컬 페이지(1부터)를 그 배열의 값으로 치환합니다. 매핑을 찾지 못하면(필터링 미적용
 *   파일 등) 페이지 번호를 그대로 둡니다 — 그런 파일은 원래부터 전체 문서가 전송됐으므로
 *   변환이 필요 없습니다.
 */
function remapPayloadPages(
  payload: RawEvaluationPayload,
  meta: Pick<DocumentPayload, "chunk" | "pageMaps"> | null | undefined,
): RawEvaluationPayload {
  const chunk = meta?.chunk;
  const pageMaps = meta?.pageMaps;
  if (!chunk && (!pageMaps || pageMaps.length === 0)) return payload;

  const remap = (fileName: string | undefined, page: unknown): { fileName?: string; page?: number } => {
    const num = Number(page);
    if (!Number.isFinite(num) || num < 1) return { fileName, page: undefined };

    if (chunk) {
      return { fileName: chunk.fileName, page: num + (chunk.startPage - 1) };
    }

    const mapping = findPageMapping(pageMaps, fileName ?? "");
    if (!mapping) return { fileName, page: num };
    return { fileName, page: mapping[num - 1] };
  };

  return {
    ...payload,
    checklistPages: payload.checklistPages?.map((entry) => ({ ...entry, ...remap(entry?.fileName, entry?.page) })),
    items: payload.items?.map((entry) => ({ ...entry, ...remap(entry?.fileName, entry?.page) })),
    findings: payload.findings?.map((finding) => ({
      ...finding,
      evidence: finding.evidence?.map((entry) => ({ ...entry, ...remap(entry?.fileName, entry?.page) })),
    })),
  };
}

function toChecklistItems(entries: NonNullable<RawEvaluationPayload["items"]>): ChecklistItem[] {
  return entries
    .map((entry, index) => ({
      id: String(entry?.id ?? `c${index + 1}`),
      category: String(entry?.category ?? "").trim() || undefined,
      text: String(entry?.text ?? "").trim(),
      source:
        entry?.fileName && entry?.page
          ? { fileName: String(entry.fileName), page: Number(entry.page) }
          : undefined,
    }))
    .filter((item) => item.text.length >= 4);
}

/** 여러 구간에서 추출된 항목을 본문 기준으로 중복 제거하고 id를 재부여합니다. */
export function mergeExtractedItems(groups: ChecklistItem[][]): ChecklistItem[] {
  const seen = new Set<string>();
  const merged: ChecklistItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = item.text.replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, id: `c${merged.length + 1}` });
    }
  }
  return merged;
}

/**
 * 구간별 판정을 병합합니다: 충족 > 부분충족 > 미충족 > 확인불가 우선.
 * (한 구간에서라도 근거를 확인하면 그 판정이 부분 문서의 '확인불가'보다 우선)
 */
export function mergeGroupFindings(groups: ChecklistFinding[][], items: ChecklistItem[]): ChecklistFinding[] {
  const byItem = new Map<string, ChecklistFinding>();

  for (const findings of groups) {
    for (const finding of findings) {
      const current = byItem.get(finding.itemId);
      if (!current) {
        byItem.set(finding.itemId, finding);
        continue;
      }

      const winner = STATUS_RANK[finding.status] > STATUS_RANK[current.status] ? finding : current;
      const loser = winner === finding ? current : finding;
      const evidence = [...winner.evidence];
      for (const entry of loser.evidence) {
        if (evidence.length >= 6) break;
        if (!evidence.some((known) => known.fileName === entry.fileName && known.page === entry.page)) {
          evidence.push(entry);
        }
      }
      byItem.set(finding.itemId, { ...winner, evidence });
    }
  }

  return items.flatMap((item) => {
    const finding = byItem.get(item.id);
    return finding ? [finding] : [];
  });
}

function buildItemsPrompt(items: ChecklistItem[], projectLabel: string, contextText: string): string {
  const itemsJson = JSON.stringify(
    items.map((item) => ({ id: item.id, category: item.category, text: item.text })),
    null,
    0,
  );

  return `${projectLabel}

${contextText}

[평가할 체크리스트 항목]
${itemsJson}

위 항목 각각에 대해 제출 문서 전체(도면·이미지 포함)를 근거로 판정하세요.
출력 형식(JSON만):
{"summary":"전체 총평 2~3문장","findings":[{"itemId":"c1","status":"충족|부분충족|미충족|확인불가","rationale":"판단 근거","evidence":[{"fileName":"파일명","page":3,"note":"확인 내용"}],"lawRefs":[{"title":"법령명","article":"조항"}],"recommendation":"보완 방향(미충족·부분충족 시)"}]}`;
}

function buildVisionExtractAndEvaluatePrompt(projectLabel: string, contextText: string): string {
  return `${projectLabel}

${contextText}

제출 문서의 텍스트 레이어에서 체크리스트를 찾지 못했습니다. 문서(스캔·이미지 포함)를 직접 확인하여:
1. '체크리스트' 제목이 있는 페이지들을 찾고, 그 표의 점검 항목을 원문 그대로 추출하세요.
2. 각 항목에 대해 제출 문서 전체(도면·이미지 포함)를 근거로 충족 여부를 판정하세요.

출력 형식(JSON만):
{"summary":"전체 총평 2~3문장","checklistPages":[{"fileName":"파일명","page":5}],"items":[{"id":"c1","category":"구분","text":"항목 원문","fileName":"파일명","page":5}],"findings":[{"itemId":"c1","status":"충족|부분충족|미충족|확인불가","rationale":"판단 근거","evidence":[{"fileName":"파일명","page":3,"note":"확인 내용"}],"lawRefs":[{"title":"법령명","article":"조항"}],"recommendation":"보완 방향(미충족·부분충족 시)"}]}

체크리스트 페이지를 찾지 못하면 {"summary":"...","checklistPages":[],"items":[],"findings":[]} 형태로 출력하세요.`;
}

type RawFinding = {
  itemId?: string;
  status?: string;
  rationale?: string;
  evidence?: Array<{
    fileName?: string;
    page?: number;
    note?: string;
    region?: { x?: number; y?: number; width?: number; height?: number };
  }>;
  lawRefs?: Array<{ title?: string; article?: string } | string>;
  spatialNote?: string;
  recommendation?: string;
};

type RawEvaluationPayload = {
  summary?: string;
  checklistPages?: Array<{ fileName?: string; page?: number }>;
  items?: Array<{ id?: string; category?: string; text?: string; fileName?: string; page?: number }>;
  findings?: RawFinding[];
};

function parsePayload(raw: string): RawEvaluationPayload | null {
  const json = extractJsonContent(raw);
  if (!json) return null;
  try {
    return JSON.parse(json) as RawEvaluationPayload;
  } catch {
    return salvageTruncatedPayload(json);
  }
}

/**
 * max_tokens 등으로 잘린 JSON에서 완성된 finding 객체만 복구합니다.
 * findings 배열 안의 균형 잡힌 {...} 블록을 순서대로 파싱합니다.
 */
export function salvageTruncatedPayload(json: string): RawEvaluationPayload | null {
  const summaryMatch = json.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const findingsStart = json.indexOf('"findings"');
  if (findingsStart === -1) return null;

  const arrayStart = json.indexOf("[", findingsStart);
  if (arrayStart === -1) return null;

  const findings: RawFinding[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < json.length; index += 1) {
    const char = json[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        try {
          const parsed = JSON.parse(json.slice(objectStart, index + 1)) as RawFinding;
          if (parsed?.itemId) findings.push(parsed);
        } catch {
          // 불완전한 객체는 건너뜀
        }
        objectStart = -1;
      }
    } else if (char === "]" && depth === 0) {
      break;
    }
  }

  if (findings.length === 0) return null;

  return {
    summary: summaryMatch ? summaryMatch[1] : undefined,
    findings,
  };
}

/** 페이지 인용 검증: 텍스트 레이어가 있으면 알려진 페이지만, 없으면 totalPages 범위만 확인. */
function buildKnownPagesIndex(files: UploadedFileSummary[]) {
  const slices = parsePageSlices(files);
  const knownPages = new Set(slices.map((slice) => `${slice.fileName}#${slice.page}`));
  const totals = new Map<string, number>();
  for (const file of files) {
    if (file.totalPages) totals.set(file.originalName, file.totalPages);
  }

  return (fileName: string, page: number): boolean => {
    if (!fileName || !Number.isFinite(page) || page < 1) return false;
    if (knownPages.has(`${fileName}#${page}`)) return true;
    const total = totals.get(fileName);
    if (total) return page <= total;
    // 파일명·페이지 정보가 전혀 없으면 보수적으로 허용하지 않음
    return knownPages.size === 0 && totals.size === 0;
  };
}

/** 정규화 좌표(0~1) 영역을 검증·클램프합니다. 유효하지 않으면 undefined. */
export function sanitizeEvidenceRegion(
  raw?: { x?: number; y?: number; width?: number; height?: number },
): EvidenceRegion | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const clamp01 = (value: unknown): number | null => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.min(1, Math.max(0, num));
  };

  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  const width = clamp01(raw.width);
  const height = clamp01(raw.height);
  if (x === null || y === null || width === null || height === null) return undefined;
  if (width <= 0.001 || height <= 0.001) return undefined;

  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

export function sanitizeFindings(
  rawFindings: RawFinding[],
  items: ChecklistItem[],
  context: EvaluationContext,
  files: UploadedFileSummary[],
): ChecklistFinding[] {
  const itemIds = new Set(items.map((item) => item.id));
  const isKnownPage = buildKnownPagesIndex(files);

  const lawIndex = [
    ...context.referenceLaws.map((law) => ({ title: law.title, sourceUrl: law.sourceUrl })),
    ...context.referenceGuidelines.map((guide) => ({ title: guide.title, sourceUrl: guide.sourceUrl })),
  ];

  const findings: ChecklistFinding[] = [];
  const seen = new Set<string>();

  for (const raw of rawFindings) {
    const itemId = String(raw?.itemId ?? "").trim();
    if (!itemId || !itemIds.has(itemId) || seen.has(itemId)) continue;
    seen.add(itemId);

    const evidence: ChecklistEvidence[] = (raw.evidence ?? [])
      .map((entry) => ({
        fileName: String(entry?.fileName ?? "").trim(),
        page: Number(entry?.page) || 0,
        note: String(entry?.note ?? "").trim(),
        region: sanitizeEvidenceRegion(entry?.region),
      }))
      .filter((entry) => entry.note && isKnownPage(entry.fileName, entry.page))
      .slice(0, 6);

    const lawRefs: ChecklistLawRef[] = (raw.lawRefs ?? [])
      .map((entry) => {
        const title = typeof entry === "string" ? entry : String(entry?.title ?? "");
        const article = typeof entry === "string" ? undefined : String(entry?.article ?? "").trim() || undefined;
        return { title: title.trim(), article };
      })
      .filter((ref) => ref.title)
      .flatMap((ref) => {
        const matched = lawIndex.find(
          (law) => law.title.includes(ref.title) || ref.title.includes(law.title),
        );
        // 조회된 법령 목록에 없는 인용은 제거 (환각 방지)
        return matched ? [{ ...ref, title: matched.title, sourceUrl: matched.sourceUrl }] : [];
      })
      .slice(0, 4);

    let status = normalizeChecklistStatus(raw.status);
    // 근거 없는 "충족" 판정은 신뢰 불가 → 확인불가로 강등
    if (status === "충족" && evidence.length === 0) {
      status = "확인불가";
    }

    findings.push({
      itemId,
      status,
      rationale: String(raw.rationale ?? "").trim() || "판단 근거가 제공되지 않음",
      evidence,
      lawRefs,
      spatialNote: String(raw.spatialNote ?? "").trim() || undefined,
      recommendation: String(raw.recommendation ?? "").trim() || undefined,
    });
  }

  // 응답에서 누락된 항목은 확인불가 처리
  for (const item of items) {
    if (!seen.has(item.id)) {
      findings.push({
        itemId: item.id,
        status: "확인불가",
        rationale: "AI 응답에서 이 항목의 판정이 누락됨 (확인불가 처리)",
        evidence: [],
        lawRefs: [],
      });
    }
  }

  return findings;
}

function chunkItems(items: ChecklistItem[]): ChecklistItem[][] {
  if (items.length <= ITEMS_PER_BATCH + 5) return [items];
  const chunkCount = Math.ceil(items.length / ITEMS_PER_BATCH);
  const size = Math.ceil(items.length / chunkCount);
  const chunks: ChecklistItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * 체크리스트 항목을 문서 전체 근거로 평가합니다.
 * items가 비어 있으면(텍스트 레이어에서 체크리스트 미발견) 비전으로 추출+평가를 한 번에 수행합니다.
 */
export async function evaluateChecklistItems(options: {
  files: UploadedFileSummary[];
  items: ChecklistItem[];
  checklistPages: ChecklistSourcePage[];
  context: EvaluationContext;
  /** 서버 마감까지 남은 시간(ms) — API 호출 타임아웃 산정 */
  getRemainingBudgetMs?: () => number;
  onProgress?: (label: string) => void;
}): Promise<EvaluateItemsResult> {
  const { files, context, onProgress } = options;
  const resolveTimeoutMs = () => {
    const remaining = options.getRemainingBudgetMs?.() ?? 280_000;
    return Math.max(30_000, Math.min(remaining - 8_000, 240_000));
  };
  const warnings: string[] = [];

  const visionExtractMode = options.items.length === 0;
  const visionSelection = selectClaudeVisionFiles(files);
  // 용량 초과로 제외된 파일의 구간 분할 폴백은 한 번만 계산해 재사용합니다 — 페이지 관련도
  // 필터링이 가능한 배치는 이 폴백을 쓰지 않지만, 필터링이 불가능한(텍스트 레이어 없음 등)
  // 경우를 위해 미리 준비해 둡니다.
  const chunkFallbackPayloads = await buildChunkFallbackPayloads(files, visionSelection.excluded, warnings);
  // 캐싱은 항목 평가 배치를 병렬로 실행하는 한(아래 참고) 대부분 무의미함 — 캐시가
  // 기록되기 전에 다음 요청이 이미 나가버림. 유일한 예외는 대용량 PDF가 여러 구간으로
  // 분할되는 경우(excluded.length>0): 구간 탐색 호출이 평가 배치보다 먼저 끝나
  // 캐시를 미리 만들어 두므로, 그 뒤에 병렬로 나가는 평가 배치들도 캐시를 활용할 수 있음.
  const shouldCacheBaseDocuments = visionExtractMode && visionSelection.excluded.length > 0;
  const payloads = await buildDocumentPayloads(files, visionSelection, chunkFallbackPayloads, shouldCacheBaseDocuments);
  const hasVision = payloads.some(payloadHasVision);

  const projectLabel = context.project
    ? `[사업 개요] ${context.project.name} / ${context.project.projectType} / ${context.project.reviewType} / 위치: ${context.project.location}`
    : "[사업 개요] 정보 없음";
  const contextText = buildContextText(context);

  // 비용 진단용 — 이 검토(리뷰) 한 건 안의 모든 Claude 호출(체크리스트 추출 + 배치 평가)
  // 토큰 사용량을 합산합니다. 회차마다 비용이 크게 달라지는 원인(배치 수 변동·페이지
  // 선별량 변동 등)을 로그로 추적할 수 있게 합니다.
  const usageByModel: UsageByModel = new Map();

  const runCall = async (
    prompt: string,
    payload: DocumentPayload | null,
    itemCount: number,
    system: string = EVALUATE_SYSTEM_PROMPT,
  ) => {
    const docBlocks = payload ? payload.blocks : (await buildDocumentBlocks(files, null)).blocks;
    const blocks: ClaudeContentBlock[] = [...docBlocks, { type: "text", text: prompt }];
    const result = await callClaude({
      system,
      userBlocks: blocks,
      maxOutputTokens: resolveMaxOutputTokens(itemCount),
      includesPdf: payload ? payloadHasVision(payload) : false,
      timeoutMs: resolveTimeoutMs(),
    });
    addUsage(usageByModel, result.model, result.usage);
    return result;
  };

  // ── 텍스트에서 항목을 얻지 못한 경우: 비전으로 체크리스트 추출 ──
  let items = options.items;
  let checklistPages: ChecklistSourcePage[] = options.checklistPages;
  let extractionModel = "";

  if (visionExtractMode) {
    if (!hasVision) {
      return {
        findings: [],
        items: [],
        checklistPages: [],
        summary: "",
        model: "",
        usedVision: false,
        warnings: [
          ...warnings,
          "문서 텍스트에서 '체크리스트' 페이지를 찾지 못했고, 비전 분석도 불가능해 평가를 진행하지 못했습니다. 체크리스트가 포함된 PDF인지 확인해 주세요.",
        ],
        usageByModel,
      };
    }

    if (payloads.length === 1) {
      // 단일 그룹: 추출+평가를 한 번에 (기존 동작). 항목을 아직 모르므로 매뉴얼은 일반 발췌.
      const genericManual = buildManualContextText([
        context.project?.projectType ?? "",
        "경관심의 체크리스트 상정도서 작성방법",
      ]);
      const extractContext = genericManual ? `${contextText}\n\n${genericManual}` : contextText;
      onProgress?.("문서에서 체크리스트를 찾아 추출·평가 중입니다 (비전 분석)");
      const result = await runCall(buildVisionExtractAndEvaluatePrompt(projectLabel, extractContext), payloads[0], 60);
      const payload = parsePayload(result.text);
      if (!payload) {
        throw new Error("AI 평가 응답(JSON)을 해석하지 못했습니다. 다시 시도해 주세요.");
      }

      const extractedItems = toChecklistItems(payload.items ?? []);
      const pages: ChecklistSourcePage[] = (payload.checklistPages ?? [])
        .map((entry) => ({ fileName: String(entry?.fileName ?? ""), page: Number(entry?.page) || 0 }))
        .filter((entry) => entry.fileName && entry.page > 0);

      return {
        findings: sanitizeFindings(payload.findings ?? [], extractedItems, context, files),
        items: extractedItems,
        checklistPages: pages,
        summary: String(payload.summary ?? "").trim(),
        model: result.model,
        usedVision: true,
        warnings,
        usageByModel,
      };
    }

    // 다중 그룹(대용량 분할): 1단계 — 구간별 병렬로 체크리스트 탐색·추출
    onProgress?.(`대용량 문서를 ${payloads.length}개 구간으로 나눠 체크리스트를 찾는 중입니다`);
    const extractionResults = await Promise.allSettled(
      payloads.map(async (payload) => {
        const result = await runCall(
          buildVisionExtractPrompt(projectLabel, payload.chunk ? chunkNote(payload.chunk) : undefined),
          payload,
          25,
          VISION_EXTRACT_SYSTEM,
        );
        const parsed = parsePayload(result.text);
        return { payload, model: result.model, parsed: parsed ? remapPayloadPages(parsed, payload) : null };
      }),
    );

    const extracted = extractionResults.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
    if (extracted.length === 0) {
      const firstRejection = extractionResults.find(
        (entry): entry is PromiseRejectedResult => entry.status === "rejected",
      );
      throw firstRejection?.reason ?? new Error("체크리스트 탐색 호출이 모두 실패했습니다.");
    }
    if (extracted.length < payloads.length) {
      warnings.push("일부 구간의 체크리스트 탐색 호출이 실패해 해당 구간은 결과에서 제외됐습니다.");
    }

    items = mergeExtractedItems(extracted.map((entry) => toChecklistItems(entry.parsed?.items ?? [])));
    checklistPages = extracted.flatMap((entry) =>
      (entry.parsed?.checklistPages ?? [])
        .map((page) => ({
          fileName: String(page?.fileName ?? entry.payload.chunk?.fileName ?? ""),
          page: Number(page?.page) || 0,
        }))
        .filter((page) => page.fileName && page.page > 0),
    );
    extractionModel = extracted[extracted.length - 1]?.model ?? "";

    if (items.length === 0) {
      return {
        findings: [],
        items: [],
        checklistPages: [],
        summary: "",
        model: extractionModel,
        usedVision: true,
        warnings: [
          ...warnings,
          "비전 분석으로도 문서에서 '체크리스트' 페이지를 찾지 못했습니다. 체크리스트가 포함된 자료인지 확인해 주세요.",
        ],
        usageByModel,
      };
    }
  }

  // ── 2단계: 항목 배치 × 문서 그룹 병렬 평가 ──
  // 체크리스트 항목과 관련성 높은 심의 매뉴얼 페이지를 발췌해 평가 기준으로 주입
  const manualContextText = buildManualContextText(items.map((item) => item.text));
  const evaluationContextText = manualContextText ? `${contextText}\n\n${manualContextText}` : contextText;

  const batches = chunkItems(items);
  const groupCount = Math.max(1, payloads.length);
  onProgress?.(
    batches.length * groupCount > 1
      ? `체크리스트 ${items.length}개 항목 평가 중 (배치 ${batches.length} × 문서 그룹 ${groupCount} 병렬 처리)`
      : `체크리스트 ${items.length}개 항목 평가 중`,
  );

  const evaluateBatchOnPayload = async (batch: ChecklistItem[], payload: DocumentPayload | null) => {
    const basePrompt = buildItemsPrompt(batch, projectLabel, evaluationContextText);
    const notes: string[] = [];
    if (payload?.chunk) notes.push(chunkNote(payload.chunk));
    for (const map of payload?.pageMaps ?? []) notes.push(relevantPagesNote(map.fileName, map.mapping.length));
    const prompt = notes.length > 0 ? `${notes.join("\n\n")}\n\n${basePrompt}` : basePrompt;

    let result;
    try {
      result = await runCall(prompt, payload, batch.length);
    } catch (error) {
      if (error instanceof ClaudePayloadTooLargeError && payload && payloadHasVision(payload) && !payload.chunk) {
        warnings.push("도면·이미지 포함 요청이 용량을 초과해 텍스트 전용으로 재시도했습니다.");
        result = await runCall(basePrompt, null, batch.length);
      } else {
        throw error;
      }
    }

    const parsed = parsePayload(result.text);
    if (!parsed) {
      console.error(
        `[checklist-review] JSON 해석 실패 stop=${result.stopReason} len=${result.text.length} tail=${result.text.slice(-200)}`,
      );
      throw new Error("AI 평가 응답(JSON)을 해석하지 못했습니다. 다시 시도해 주세요.");
    }
    if (result.stopReason === "max_tokens") {
      console.warn(`[checklist-review] 응답이 max_tokens로 잘림 — 복구된 findings=${parsed.findings?.length ?? 0}`);
      warnings.push("일부 배치의 AI 응답이 길이 제한으로 잘려, 판정이 누락된 항목은 확인불가로 처리했습니다.");
    }

    const translated = remapPayloadPages(parsed, payload);
    return {
      model: result.model,
      summary: translated.summary?.trim() ?? "",
      findings: sanitizeFindings(translated.findings ?? [], batch, context, files),
    };
  };

  const evaluateBatch = async (batch: ChecklistItem[], batchIndex: number) => {
    // 배치마다 그 배치의 항목과 관련성 높은 페이지만 담은 페이로드를 새로 구성합니다
    // (페이지 관련도 필터링) — 매 배치가 문서 전체를 재전송하던 기존 방식 대비 비용이 줄어듭니다.
    const batchPayloads = await buildBatchDocumentPayloads(
      files,
      visionSelection,
      batch,
      checklistPages,
      chunkFallbackPayloads,
    );
    // 비용 진단용 — 이 배치가 실제로 몇 페이지를 재전송했는지 남깁니다. 회차마다 비용이
    // 달라지는 원인이 "항목 추출 결과(배치 수)"인지 "페이지 선별량"인지 여기서 구분됩니다.
    const pageLog = batchPayloads
      .map((payload) => {
        if (payload.chunk) return `${payload.chunk.fileName}:구간(p.${payload.chunk.startPage}-${payload.chunk.endPage})`;
        if (payload.pageMaps?.length) {
          return payload.pageMaps.map((entry) => `${entry.fileName}:필터링(${entry.mapping.length}p)`).join(",");
        }
        return payloadHasVision(payload) ? "전체문서" : "텍스트전용";
      })
      .join(" | ");
    console.log(
      `[checklist-review] batch=${batchIndex + 1}/${batches.length} items=${batch.length} groups=${batchPayloads.length} pages=[${pageLog}]`,
    );

    const targets: Array<DocumentPayload | null> = batchPayloads.length > 0 ? batchPayloads : [null];
    const settled = await Promise.allSettled(targets.map((payload) => evaluateBatchOnPayload(batch, payload)));
    const succeeded = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));

    if (succeeded.length === 0) {
      const firstRejection = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
      throw firstRejection?.reason ?? new Error("평가 호출이 모두 실패했습니다.");
    }
    if (succeeded.length < targets.length) {
      warnings.push("일부 문서 구간의 평가 호출이 실패해 해당 구간의 근거는 반영되지 않았습니다.");
    }

    return {
      model: succeeded[succeeded.length - 1].model,
      summary: succeeded.map((entry) => entry.summary).find(Boolean) ?? "",
      findings: mergeGroupFindings(succeeded.map((entry) => entry.findings), batch),
    };
  };

  // 배치를 순차/제한된 동시성으로 실행해 캐싱을 노리는 시도를 두 차례 배포해봤으나,
  // 실제 문서(7.4MB, 3배치)에서 서버 시간 한도(285초)를 반복해서 초과해 검토 자체가
  // 실패했다(로그로 확인). 캐싱으로 아낄 수 있는 비용보다 "검토가 아예 안 되는" 쪽이
  // 훨씬 나쁘므로, 신뢰성을 위해 완전 병렬 실행으로 되돌림 — 배치 크기 확대(15→25)로
  // 이미 줄여둔 배치 수만큼은 여전히 절감 효과가 유지된다.
  const results = await Promise.all(batches.map((batch, index) => evaluateBatch(batch, index)));
  const allFindings = results.flatMap((entry) => entry.findings);
  const summaries = results.map((entry) => entry.summary).filter(Boolean);
  const model = results[results.length - 1]?.model ?? extractionModel;

  // 비용 진단용 — 이 검토 1건에 실제로 사용된 토큰 총합. 같은 문서를 재검토했을 때 비용이
  // 회차마다 다르다면, 이 로그의 calls(호출 횟수)·input(재전송 토큰)을 비교해 원인을
  // (체크리스트 추출 결과에 따른 배치 수 변동 vs 페이지 선별량 변동 vs 재시도) 특정할 수 있습니다.
  const usageLog = Array.from(usageByModel.entries())
    .map(([model, usage]) => `${model}:in=${usage.inputTokens},out=${usage.outputTokens},cw=${usage.cacheCreationInputTokens},cr=${usage.cacheReadInputTokens}`)
    .join(" | ");
  console.log(
    `[checklist-review] usage-summary items=${items.length} batches=${batches.length} ${usageLog}`,
  );

  return {
    findings: allFindings,
    items,
    checklistPages,
    summary: summaries.join("\n\n"),
    model,
    usedVision: hasVision,
    warnings,
    usageByModel,
  };
}
