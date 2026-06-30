import type { UploadedFileSummary } from "./analysis-types";

/** PDF document blocks may still require the beta header on some API paths. */
export const ANTHROPIC_PDF_BETA = "pdfs-2024-09-25";

export const ANTHROPIC_API_VERSION = "2023-06-01";

/** Stay under Anthropic's ~32MB request cap (base64 + prompt overhead). */
export const CLAUDE_PDF_VISION_MAX_BYTES = 18 * 1024 * 1024;

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

/** 스캔 PDF·이미지 전용 등 텍스트 추출이 부족할 때만 비전 입력을 사용합니다. */
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

  if (!shouldIncludeClaudeVision(files) || !needsClaudePdfVision(files)) {
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
