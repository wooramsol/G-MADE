import type { VisionAsset } from "../document-content";
import type { UploadedFileSummary } from "./analysis-types";

type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "high" | "low" | "auto" } };

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

function imageAssetsForFile(file: UploadedFileSummary): VisionAsset[] {
  return (file.visionAssets ?? []).filter((asset) => asset.mediaType.startsWith("image/"));
}

function pdfAssetForFile(file: UploadedFileSummary): VisionAsset | undefined {
  return (file.visionAssets ?? []).find((asset) => asset.mediaType === "application/pdf");
}

export function buildOpenAiUserContent(
  files: UploadedFileSummary[],
  promptText: string,
): OpenAiContentPart[] {
  const parts: OpenAiContentPart[] = [{ type: "text", text: promptText }];

  for (const file of files) {
    for (const asset of imageAssetsForFile(file)) {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${asset.mediaType};base64,${asset.base64}`,
          detail: "high",
        },
      });
    }
  }

  return parts;
}

export function buildGeminiUserParts(files: UploadedFileSummary[], promptText: string): GeminiPart[] {
  const parts: GeminiPart[] = [{ text: promptText }];

  for (const file of files) {
    const pdf = pdfAssetForFile(file);
    if (pdf) {
      parts.push({
        inlineData: {
          mimeType: pdf.mediaType,
          data: pdf.base64,
        },
      });
      continue;
    }

    for (const asset of imageAssetsForFile(file)) {
      parts.push({
        inlineData: {
          mimeType: asset.mediaType,
          data: asset.base64,
        },
      });
    }
  }

  return parts;
}

export function buildClaudeUserBlocks(
  files: UploadedFileSummary[],
  promptText: string,
  options?: { includeVision?: boolean },
): ClaudeContentBlock[] {
  const includeVision = options?.includeVision !== false;
  const blocks: ClaudeContentBlock[] = [];

  if (includeVision) {
    for (const file of files) {
      const pdf = pdfAssetForFile(file);
      if (pdf) {
        blocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdf.base64,
          },
        });
        continue;
      }

      for (const asset of imageAssetsForFile(file)) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: asset.mediaType,
            data: asset.base64,
          },
        });
      }
    }
  }

  blocks.push({ type: "text", text: promptText });
  return blocks;
}

export function summarizeVisionCoverage(files: UploadedFileSummary[]): string {
  let pdfCount = 0;
  let imageCount = 0;

  for (const file of files) {
    if (pdfAssetForFile(file)) {
      pdfCount += 1;
    }
    imageCount += imageAssetsForFile(file).length;
  }

  if (pdfCount === 0 && imageCount === 0) {
    return "비전 자료 없음(텍스트 추출본만 분석)";
  }

  const chunks: string[] = [];
  if (pdfCount > 0) chunks.push(`PDF 원본 ${pdfCount}건`);
  if (imageCount > 0) chunks.push(`페이지·이미지 ${imageCount}장`);
  return chunks.join(", ");
}
