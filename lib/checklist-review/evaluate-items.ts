import {
  CLAUDE_PDF_VISION_MAX_BYTES,
  estimateClaudeVisionPayloadBytes,
  shouldIncludeClaudeVision,
} from "@/lib/ai/anthropic-request";
import { extractJsonContent } from "@/lib/ai/extract-json";
import { parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import type { EvaluationContext } from "@/lib/evaluation-context";
import { callClaude, ClaudePayloadTooLargeError, type ClaudeContentBlock } from "./claude-call";
import {
  normalizeChecklistStatus,
  type ChecklistEvidence,
  type ChecklistFinding,
  type ChecklistItem,
  type ChecklistLawRef,
  type ChecklistSourcePage,
} from "./types";

const EVALUATE_MAX_OUTPUT_TOKENS = 16_384;
const ITEMS_PER_BATCH = 30;
/** 항목당 예상 출력 토큰 (간결 출력 기준) — max_tokens 산정용 */
const OUTPUT_TOKENS_PER_ITEM = 220;
const OUTPUT_TOKENS_BASE = 800;

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
- evidence의 fileName·page는 실제로 근거를 확인한 페이지만 기재합니다. 도면·이미지 속 글자도 근거로 인정합니다.
- lawRefs는 아래 '조회된 법령·지침' 목록에 있는 것만 인용합니다. 목록에 없는 법령은 절대 언급하지 않습니다.
- 사업지가 경관지구 등 공간정보에 해당하면 관련 항목의 spatialNote에 반영합니다.
- "미충족"·"부분충족" 항목에는 구체적인 보완 방향(recommendation)을 제시합니다.
- 간결하게 씁니다: rationale은 2문장 이내, evidence는 항목당 최대 2개(note는 60자 이내), recommendation은 1~2문장.
- 반드시 JSON만 출력합니다.`;

export type EvaluateItemsResult = {
  findings: ChecklistFinding[];
  items: ChecklistItem[];
  checklistPages: ChecklistSourcePage[];
  summary: string;
  model: string;
  usedVision: boolean;
  warnings: string[];
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
    parts.push(
      `[공간정보 (브이월드)]\n주소: ${context.spatial.address}\n경관지구 해당: ${context.spatial.inLandscapeZone ? "예" : "아니오"}\n관련 구역: ${zones}`,
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

function buildDocumentBlocks(files: UploadedFileSummary[], useVision: boolean): ClaudeContentBlock[] {
  const blocks: ClaudeContentBlock[] = [];

  if (useVision) {
    for (const file of files) {
      for (const asset of file.visionAssets ?? []) {
        if (asset.mediaType === "application/pdf") {
          blocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: asset.base64 },
            title: file.originalName,
          });
        } else {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: asset.mediaType, data: asset.base64 },
          });
        }
      }
    }
  } else {
    for (const file of files) {
      const text = (file.extractedTextPreview ?? "").trim();
      if (text) {
        blocks.push({ type: "text", text: `=== 제출 문서: ${file.originalName} ===\n${text}` });
      }
    }
  }

  // 배치 호출 시 문서 페이로드 재사용 (prompt caching)
  const last = blocks[blocks.length - 1];
  if (last) last.cache_control = { type: "ephemeral" };

  return blocks;
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
{"summary":"전체 총평 2~3문장","findings":[{"itemId":"c1","status":"충족|부분충족|미충족|확인불가","rationale":"판단 근거","evidence":[{"fileName":"파일명","page":3,"note":"확인 내용"}],"lawRefs":[{"title":"법령명","article":"조항"}],"spatialNote":"공간정보 근거(해당 시)","recommendation":"보완 방향(미충족·부분충족 시)"}]}`;
}

function buildVisionExtractAndEvaluatePrompt(projectLabel: string, contextText: string): string {
  return `${projectLabel}

${contextText}

제출 문서의 텍스트 레이어에서 체크리스트를 찾지 못했습니다. 문서(스캔·이미지 포함)를 직접 확인하여:
1. '체크리스트' 제목이 있는 페이지들을 찾고, 그 표의 점검 항목을 원문 그대로 추출하세요.
2. 각 항목에 대해 제출 문서 전체(도면·이미지 포함)를 근거로 충족 여부를 판정하세요.

출력 형식(JSON만):
{"summary":"전체 총평 2~3문장","checklistPages":[{"fileName":"파일명","page":5}],"items":[{"id":"c1","category":"구분","text":"항목 원문","fileName":"파일명","page":5}],"findings":[{"itemId":"c1","status":"충족|부분충족|미충족|확인불가","rationale":"판단 근거","evidence":[{"fileName":"파일명","page":3,"note":"확인 내용"}],"lawRefs":[{"title":"법령명","article":"조항"}],"spatialNote":"공간정보 근거(해당 시)","recommendation":"보완 방향(미충족·부분충족 시)"}]}

체크리스트 페이지를 찾지 못하면 {"summary":"...","checklistPages":[],"items":[],"findings":[]} 형태로 출력하세요.`;
}

type RawFinding = {
  itemId?: string;
  status?: string;
  rationale?: string;
  evidence?: Array<{ fileName?: string; page?: number; note?: string }>;
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
    return null;
  }
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
      rationale: String(raw.rationale ?? "").trim() || "판단 근거가 제공되지 않았습니다.",
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
        rationale: "AI 응답에서 이 항목의 판정이 누락되었습니다.",
        evidence: [],
        lawRefs: [],
      });
    }
  }

  return findings;
}

function chunkItems(items: ChecklistItem[]): ChecklistItem[][] {
  if (items.length <= ITEMS_PER_BATCH + 6) return [items];
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

  const useVision = shouldIncludeClaudeVision(files);
  if (!useVision && files.some((file) => (file.visionAssets ?? []).length > 0)) {
    warnings.push(
      `제출 자료 용량이 커서(${Math.round(estimateClaudeVisionPayloadBytes(files) / 1024 / 1024)}MB > ${Math.round(CLAUDE_PDF_VISION_MAX_BYTES / 1024 / 1024)}MB) 도면·이미지 비전 분석 없이 텍스트만으로 평가했습니다.`,
    );
  }

  const projectLabel = context.project
    ? `[사업 개요] ${context.project.name} / ${context.project.projectType} / ${context.project.reviewType} / 위치: ${context.project.location}`
    : "[사업 개요] 정보 없음";
  const contextText = buildContextText(context);

  const visionExtractMode = options.items.length === 0;

  const runCall = async (prompt: string, vision: boolean, itemCount: number) => {
    const blocks: ClaudeContentBlock[] = [
      ...buildDocumentBlocks(files, vision),
      { type: "text", text: prompt },
    ];
    return callClaude({
      system: EVALUATE_SYSTEM_PROMPT,
      userBlocks: blocks,
      maxOutputTokens: resolveMaxOutputTokens(itemCount),
      includesPdf: vision,
      timeoutMs: resolveTimeoutMs(),
    });
  };

  // ── 비전 추출+평가 단일 호출 모드 ──
  if (visionExtractMode) {
    if (!useVision) {
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
      };
    }

    onProgress?.("문서에서 체크리스트를 찾아 추출·평가 중입니다 (비전 분석)");
    const result = await runCall(buildVisionExtractAndEvaluatePrompt(projectLabel, contextText), true, 60);
    const payload = parsePayload(result.text);
    if (!payload) {
      throw new Error("AI 평가 응답(JSON)을 해석하지 못했습니다. 다시 시도해 주세요.");
    }

    const items: ChecklistItem[] = (payload.items ?? [])
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

    const checklistPages: ChecklistSourcePage[] = (payload.checklistPages ?? [])
      .map((entry) => ({ fileName: String(entry?.fileName ?? ""), page: Number(entry?.page) || 0 }))
      .filter((entry) => entry.fileName && entry.page > 0);

    return {
      findings: sanitizeFindings(payload.findings ?? [], items, context, files),
      items,
      checklistPages,
      summary: String(payload.summary ?? "").trim(),
      model: result.model,
      usedVision: true,
      warnings,
    };
  }

  // ── 사전 추출된 항목 평가 모드 (배치는 병렬 실행으로 서버 한도 내 처리) ──
  const chunks = chunkItems(options.items);
  onProgress?.(
    chunks.length > 1
      ? `체크리스트 ${options.items.length}개 항목 평가 중 (${chunks.length}개 배치 병렬 처리)`
      : `체크리스트 ${options.items.length}개 항목 평가 중`,
  );

  const evaluateChunk = async (chunk: ChecklistItem[]) => {
    let result;
    try {
      result = await runCall(buildItemsPrompt(chunk, projectLabel, contextText), useVision, chunk.length);
    } catch (error) {
      if (error instanceof ClaudePayloadTooLargeError && useVision) {
        warnings.push("도면·이미지 포함 요청이 용량을 초과해 텍스트 전용으로 재시도했습니다.");
        result = await runCall(buildItemsPrompt(chunk, projectLabel, contextText), false, chunk.length);
      } else {
        throw error;
      }
    }

    const payload = parsePayload(result.text);
    if (!payload) {
      throw new Error("AI 평가 응답(JSON)을 해석하지 못했습니다. 다시 시도해 주세요.");
    }

    return {
      model: result.model,
      summary: payload.summary?.trim() ?? "",
      findings: sanitizeFindings(payload.findings ?? [], chunk, context, files),
    };
  };

  const results = await Promise.all(chunks.map((chunk) => evaluateChunk(chunk)));
  const allFindings = results.flatMap((entry) => entry.findings);
  const summaries = results.map((entry) => entry.summary).filter(Boolean);
  const model = results[results.length - 1]?.model ?? "";

  return {
    findings: allFindings,
    items: options.items,
    checklistPages: options.checklistPages,
    summary: summaries.join(" "),
    model,
    usedVision: useVision,
    warnings,
  };
}
