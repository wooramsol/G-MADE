import { CLAUDE_FAST_MODEL } from "@/lib/ai/claude-models";
import { extractJsonContent } from "@/lib/ai/extract-json";
import { parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import { splitPdfIntoChunks } from "@/lib/pdf/split-pdf";
import { callClaude, type ClaudeContentBlock, type ClaudeUsage } from "./claude-call";
import type { ChecklistReviewMetric } from "./types";
import { addUsage, type UsageByModel } from "./usage-cost";

const METRIC_KEYWORDS =
  /대\s*지\s*면\s*적|건\s*축\s*면\s*적|연\s*면\s*적|건\s*폐\s*율|용\s*적\s*률|조\s*경\s*면\s*적|주\s*차|층\s*수|최\s*고\s*높\s*이|사\s*업\s*개\s*요|건\s*축\s*개\s*요/;

const METRICS_SYSTEM = `당신은 건축·경관 심의 문서에서 사업 규모 지표를 추출하는 도구입니다.
규칙:
- 문서에 명시된 값만 추출합니다. 계산·추정·보완 금지.
- value는 단위를 포함해 원문 표기 그대로 적습니다 (예: "12,345.67㎡", "지상 15층/지하 2층", "249.5%").
- 같은 지표가 여러 번 나오면 사업 개요(총괄표) 기준 값을 사용합니다.
- 반드시 JSON만 출력합니다.`;

const METRICS_PROMPT = `제출 문서에서 다음 사업 규모 지표를 찾아 추출하세요 (문서에 있는 것만):
대지면적, 건축면적, 연면적, 지상연면적, 지하연면적, 건폐율, 용적률, 규모(지상·지하 층수), 최고높이, 조경면적, 주차대수, 세대수, 주용도.
출력 형식(JSON만):
{"metrics":[{"label":"대지면적","value":"12,345.6㎡","fileName":"파일명","page":3}]}
찾지 못한 지표는 넣지 마세요.`;

const VISION_CHUNK_MAX_BYTES = 15 * 1024 * 1024;
const VISION_CHUNK_MAX_PAGES = 40;

export type ExtractMetricsResult = {
  metrics: ChecklistReviewMetric[];
  usageByModel: UsageByModel;
};

/** 사업개요의 핵심 지표 — 이 중 하나라도 없으면 비전 보완을 시도합니다. */
const CORE_METRIC_PATTERNS: RegExp[] = [
  /대\s*지\s*면\s*적/,
  /건\s*축\s*면\s*적/,
  /건\s*폐\s*율/,
  /용\s*적\s*률/,
  /층\s*수|규\s*모/,
];

/** 추출된 지표에 핵심 지표 누락이 있는지 — 개요표가 이미지/외곽선 글자인 문서 감지용. */
export function isMissingCoreMetrics(metrics: ChecklistReviewMetric[]): boolean {
  return CORE_METRIC_PATTERNS.some((pattern) => !metrics.some((metric) => pattern.test(metric.label)));
}

/** 라벨(공백 무시) 기준으로 병합 — primary(텍스트 추출) 우선, secondary(비전)는 빠진 라벨만 보충. */
export function mergeMetrics(
  primary: ChecklistReviewMetric[],
  secondary: ChecklistReviewMetric[],
): ChecklistReviewMetric[] {
  const normalize = (label: string) => label.replace(/\s+/g, "");
  const seen = new Set(primary.map((metric) => normalize(metric.label)));
  const merged = [...primary];
  for (const metric of secondary) {
    const key = normalize(metric.label);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(metric);
  }
  return merged.slice(0, 16);
}

/**
 * 제출 문서에서 사업 규모 지표를 자동 추출합니다 (저비용 모델).
 * 텍스트 레이어에 개요 정보가 있으면 텍스트로, 스캔본이면 첫 PDF 앞부분을 비전으로 읽습니다.
 * 실패해도 검토 흐름을 막지 않도록 빈 배열을 반환합니다.
 */
export async function extractProjectMetrics(files: UploadedFileSummary[]): Promise<ExtractMetricsResult> {
  const usageByModel: UsageByModel = new Map();

  try {
    // 1차: 개요 키워드가 있는 텍스트 페이지에서 추출
    const slices = parsePageSlices(files).filter((slice) => METRIC_KEYWORDS.test(slice.text));
    let text = "";
    for (const slice of slices) {
      const chunk = `--- 「${slice.fileName}」 p.${slice.page} ---\n${slice.text.trim()}\n`;
      if (text.length + chunk.length > 20_000) break;
      text += chunk;
    }

    if (text.trim().length >= 200) {
      const fromText = await runMetricsExtraction([{ type: "text", text }], false);
      addUsage(usageByModel, fromText.model, fromText.usage);
      if (fromText.metrics.length > 0) {
        if (!isMissingCoreMetrics(fromText.metrics)) {
          console.log(`[checklist-review] metrics=${fromText.metrics.length} mode=text`);
          return { metrics: fromText.metrics, usageByModel };
        }

        // 핵심 지표(대지면적·건폐율 등)가 빠짐 — 사업개요 표가 이미지나 외곽선 글자로
        // 들어가 텍스트 추출이 안 되는 문서. 비전으로 한 번 더 읽어 빠진 라벨만 보충.
        const supplementBlocks = await buildVisionBlocks(files);
        if (supplementBlocks) {
          const fromVision = await runMetricsExtraction(supplementBlocks, true);
          addUsage(usageByModel, fromVision.model, fromVision.usage);
          const merged = mergeMetrics(fromText.metrics, fromVision.metrics);
          console.log(
            `[checklist-review] metrics=${merged.length} mode=text+vision (핵심 지표 누락 -> 비전 보완, 텍스트 ${fromText.metrics.length} + 비전 보충 ${merged.length - fromText.metrics.length})`,
          );
          return { metrics: merged, usageByModel };
        }

        console.log(`[checklist-review] metrics=${fromText.metrics.length} mode=text (핵심 지표 누락, 비전 자산 없음)`);
        return { metrics: fromText.metrics, usageByModel };
      }
    }

    // 2차: 텍스트에서 못 찾음(개요표가 이미지인 경우) → 문서 앞부분 비전 판독
    const visionBlocks = await buildVisionBlocks(files);
    if (!visionBlocks) {
      console.log("[checklist-review] metrics=0 mode=none (텍스트 미검출·비전 자산 없음)");
      return { metrics: [], usageByModel };
    }

    const fromVision = await runMetricsExtraction(visionBlocks, true);
    addUsage(usageByModel, fromVision.model, fromVision.usage);
    console.log(`[checklist-review] metrics=${fromVision.metrics.length} mode=vision`);
    return { metrics: fromVision.metrics, usageByModel };
  } catch (error) {
    console.warn("[checklist-review] 규모 지표 추출 실패:", error instanceof Error ? error.message : error);
    return { metrics: [], usageByModel };
  }
}

/** 첫 PDF의 앞부분(개요가 보통 앞장에 위치)을 비전 블록으로 준비합니다. */
async function buildVisionBlocks(files: UploadedFileSummary[]): Promise<ClaudeContentBlock[] | null> {
  const file = files.find((candidate) =>
    (candidate.visionAssets ?? []).some((asset) => asset.mediaType === "application/pdf"),
  );
  const asset = file?.visionAssets?.find((entry) => entry.mediaType === "application/pdf");
  if (!file || !asset) return null;

  let base64 = asset.base64;
  const bytes = Math.ceil((base64.length * 3) / 4);
  if (bytes > VISION_CHUNK_MAX_BYTES || (file.totalPages ?? 0) > 90) {
    const chunks = await splitPdfIntoChunks(base64, {
      maxBytesPerChunk: VISION_CHUNK_MAX_BYTES,
      maxPagesPerChunk: VISION_CHUNK_MAX_PAGES,
    });
    if (chunks.length === 0) return null;
    base64 = chunks[0].base64;
  }

  return [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
      title: file.originalName,
    },
  ];
}

async function runMetricsExtraction(
  blocks: ClaudeContentBlock[],
  includesPdf: boolean,
): Promise<{ metrics: ChecklistReviewMetric[]; model: string; usage?: ClaudeUsage }> {
  const result = await callClaude({
    model: CLAUDE_FAST_MODEL,
    system: METRICS_SYSTEM,
    userBlocks: [...blocks, { type: "text", text: METRICS_PROMPT }],
    maxOutputTokens: 2_000,
    includesPdf,
    timeoutMs: 90_000,
  });

  const json = extractJsonContent(result.text);
  if (!json) return { metrics: [], model: result.model, usage: result.usage };
  const parsed = JSON.parse(json) as {
    metrics?: Array<{ label?: string; value?: string; fileName?: string; page?: number }>;
  };

  const seen = new Set<string>();
  const metrics = (parsed.metrics ?? [])
    .map((metric) => ({
      label: String(metric?.label ?? "").trim(),
      value: String(metric?.value ?? "").trim(),
      source:
        metric?.fileName && metric?.page
          ? { fileName: String(metric.fileName), page: Number(metric.page) || 0 }
          : undefined,
    }))
    .filter((metric) => {
      if (!metric.label || !metric.value || seen.has(metric.label)) return false;
      seen.add(metric.label);
      return true;
    })
    .slice(0, 16);

  return { metrics, model: result.model, usage: result.usage };
}
