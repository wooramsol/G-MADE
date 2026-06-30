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
