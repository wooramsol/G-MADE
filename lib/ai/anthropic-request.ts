import type { UploadedFileSummary } from "./uploaded-file";

/** PDF document blocks may still require the beta header on some API paths. */
export const ANTHROPIC_PDF_BETA = "pdfs-2024-09-25";

export const ANTHROPIC_API_VERSION = "2023-06-01";

/** Stay under Anthropic's ~32MB request cap (base64 + prompt overhead). */
export const CLAUDE_PDF_VISION_MAX_BYTES = 18 * 1024 * 1024;

/** Anthropic PDF document block 한도 (요청당 최대 100페이지). */
export const CLAUDE_PDF_MAX_PAGES = 100;

export type ClaudeVisionExclusionKind = "bytes" | "pages";

export type ClaudeVisionSelection = {
  /** 비전 자산을 포함할 파일 키 (visionFileKey 기준) */
  includedKeys: Set<string>;
  excluded: Array<{ fileName: string; reason: string; kind: ClaudeVisionExclusionKind }>;
};

export function visionFileKey(file: Pick<UploadedFileSummary, "id" | "originalName">): string {
  return file.id ?? file.originalName;
}

function formatMb(bytes: number): string {
  return `${Math.max(0, Math.round((bytes / 1024 / 1024) * 10) / 10)}MB`;
}

/**
 * 전체 on/off 대신 파일 단위로 비전 포함 여부를 선별합니다.
 * - PDF 100페이지 초과 파일은 API가 거부하므로 제외
 * - 누적 용량이 한도를 넘는 파일은 제외 (해당 파일은 텍스트로만 평가)
 */
export function selectClaudeVisionFiles(files: UploadedFileSummary[]): ClaudeVisionSelection {
  const includedKeys = new Set<string>();
  const excluded: ClaudeVisionSelection["excluded"] = [];
  let usedBytes = 0;

  for (const file of files) {
    const assets = file.visionAssets ?? [];
    if (assets.length === 0) continue;

    const hasPdf = assets.some((asset) => asset.mediaType === "application/pdf");
    if (hasPdf && (file.totalPages ?? 0) > CLAUDE_PDF_MAX_PAGES) {
      excluded.push({
        fileName: file.originalName,
        reason: `PDF ${file.totalPages}페이지 — 비전 한도(${CLAUDE_PDF_MAX_PAGES}페이지) 초과`,
        kind: "pages",
      });
      continue;
    }

    const bytes = assets.reduce((sum, asset) => sum + Math.ceil((asset.base64.length * 3) / 4), 0);
    if (usedBytes + bytes > CLAUDE_PDF_VISION_MAX_BYTES) {
      excluded.push({
        fileName: file.originalName,
        reason: `용량 ${formatMb(bytes)} — 남은 비전 여유(${formatMb(CLAUDE_PDF_VISION_MAX_BYTES - usedBytes)}) 초과`,
        kind: "bytes",
      });
      continue;
    }

    usedBytes += bytes;
    includedKeys.add(visionFileKey(file));
  }

  return { includedKeys, excluded };
}

export function buildAnthropicHeaders(options?: {
  includesPdf?: boolean;
  apiKey: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "x-api-key": options?.apiKey ?? "",
    "anthropic-version": ANTHROPIC_API_VERSION,
    "content-type": "application/json",
  };

  if (options?.includesPdf) {
    headers["anthropic-beta"] = ANTHROPIC_PDF_BETA;
  }

  return headers;
}

export function estimateClaudeVisionPayloadBytes(files: UploadedFileSummary[]): number {
  let bytes = 0;

  for (const file of files) {
    for (const asset of file.visionAssets ?? []) {
      bytes += Math.ceil((asset.base64.length * 3) / 4);
    }
  }

  return bytes;
}

export function filesIncludePdfVision(files: UploadedFileSummary[]): boolean {
  return files.some((file) =>
    (file.visionAssets ?? []).some((asset) => asset.mediaType === "application/pdf"),
  );
}

export function shouldIncludeClaudeVision(files: UploadedFileSummary[]): boolean {
  if (!files.some((file) => (file.visionAssets ?? []).length > 0)) {
    return false;
  }

  return estimateClaudeVisionPayloadBytes(files) <= CLAUDE_PDF_VISION_MAX_BYTES;
}

/**
 * @deprecated resolveClaudeVisionModes의 비전 게이팅 조건으로는 더 이상 사용하지 않습니다.
 * 텍스트 레이어가 있어도 도면·그림은 이미지로만 존재하므로, 텍스트 유무만으로 비전 분석을
 * 건너뛰면 안 됩니다. 스캔 문서 여부를 참고용으로 판단하고 싶을 때만 사용하세요.
 */
export function needsClaudePdfVision(files: UploadedFileSummary[]): boolean {
  for (const file of files) {
    const hasPdfVision = (file.visionAssets ?? []).some((asset) => asset.mediaType === "application/pdf");
    if (hasPdfVision) {
      const text = (file.extractedTextPreview ?? "").trim();
      if (!text || text.includes("[PDF 텍스트 레이어 없음]") || text.length < 120) {
        return true;
      }
      continue;
    }

    const hasImageVision = (file.visionAssets ?? []).some((asset) => asset.mediaType.startsWith("image/"));
    if (hasImageVision) {
      const text = (file.extractedTextPreview ?? "").trim();
      if (!text || text.startsWith("[이미지 자료]")) {
        return true;
      }
    }
  }

  return false;
}

export function resolveClaudeVisionModes(
  files: UploadedFileSummary[],
  promptOptions?: { includeVision?: boolean },
): Array<"vision" | "text-only"> {
  if (promptOptions?.includeVision === false) {
    return ["text-only"];
  }

  // 경관·공공디자인 심의 자료는 제목·범례 등 텍스트가 있어도 실제 판단 대상(배치도·입면도·
  // 조감도 등)은 이미지로만 존재한다. 텍스트 추출량이 충분하다는 이유로 비전 분석을 건너뛰면
  // 도면·그림을 놓치게 되므로, 비전 자료가 있고 요청 용량 한도 내라면 항상 비전 모드를 우선
  // 시도하고 실패 시에만 텍스트 전용으로 재시도한다.
  if (!shouldIncludeClaudeVision(files)) {
    return ["text-only"];
  }

  return ["vision", "text-only"];
}

export function isClaudePayloadOrContextError(status: number, body: string): boolean {
  const lower = body.toLowerCase();

  if (status === 413) return true;

  if (status !== 400 && status !== 422) {
    return false;
  }

  return (
    lower.includes("token") ||
    lower.includes("too large") ||
    lower.includes("payload") ||
    lower.includes("max_tokens") ||
    lower.includes("context") ||
    lower.includes("document") ||
    lower.includes("request size")
  );
}

/** Vercel 함수 한도(300s) 안에서 배치별 Claude API 대기 시간을 나눕니다. */
export const CLAUDE_FUNCTION_BUDGET_MS = 285_000;

export function resolveClaudeFetchTimeoutMs(includeVision: boolean, batchCount = 1): number {
  const safeBatchCount = Math.max(1, batchCount);
  const modeCap = includeVision ? 180_000 : 240_000;

  if (safeBatchCount === 1) {
    return 280_000;
  }

  if (safeBatchCount === 2) {
    return Math.min(modeCap, 140_000);
  }

  return Math.min(modeCap, 120_000);
}
