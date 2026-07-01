import { buildPdfPageMarkedText, buildSlideMarkedText } from "./ai/page-citation";
import { normalizeWhitespace } from "./document-text-utils";

export type VisionAsset = {
  label: string;
  mediaType: "image/png" | "image/jpeg" | "application/pdf";
  base64: string;
};

export type DocumentContent = {
  fullText: string;
  visionAssets: VisionAsset[];
  warnings: string[];
  /** PDF 등 다면 문서의 총 페이지(또는 슬라이드) 수 */
  totalPages?: number;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const TEXT_EXTRACTABLE = new Set(["pdf", "pptx", "docx", "txt", "md"]);

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isVisionCapableFile(fileName: string): boolean {
  const extension = getExtension(fileName);
  return extension === "pdf" || IMAGE_EXTENSIONS.has(extension);
}

/** 업로드 파일에서 전체 텍스트와 비전 분석용 자료(PDF·이미지)를 추출합니다. */
export async function extractDocumentContent(buffer: Buffer, fileName: string): Promise<DocumentContent> {
  const extension = getExtension(fileName);

  try {
    if (extension === "pdf") {
      return await extractPdfContent(buffer, fileName);
    }
    if (IMAGE_EXTENSIONS.has(extension)) {
      return extractImageContent(buffer, fileName, extension);
    }
    if (extension === "pptx") {
      const { fullText, totalPages } = await extractPptxContent(buffer, fileName);
      return {
        fullText,
        visionAssets: [],
        warnings: [],
        totalPages,
      };
    }
    if (extension === "docx") {
      return {
        fullText: await extractDocxText(buffer),
        visionAssets: [],
        warnings: [],
      };
    }
    if (extension === "txt" || extension === "md") {
      return {
        fullText: normalizeWhitespace(buffer.toString("utf8")),
        visionAssets: [],
        warnings: [],
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return {
      fullText: unsupportedExtractionNotice(fileName),
      visionAssets: [],
      warnings: [`"${fileName}" 내용 추출 중 오류: ${message}`],
    };
  }

  return {
    fullText: unsupportedExtractionNotice(fileName),
    visionAssets: [],
    warnings: [],
  };
}

/** @deprecated extractDocumentContent를 사용하세요. */
export async function extractDocumentText(buffer: Buffer, fileName: string): Promise<string> {
  const content = await extractDocumentContent(buffer, fileName);
  return content.fullText;
}

export function isTextExtractableFile(fileName: string): boolean {
  return TEXT_EXTRACTABLE.has(getExtension(fileName));
}

async function extractPdfContent(buffer: Buffer, fileName: string): Promise<DocumentContent> {
  const uint8 = new Uint8Array(buffer);
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(uint8);
  const extracted = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(extracted.text) ? extracted.text : [extracted.text ?? ""];
  const totalPages = extracted.totalPages ?? pageTexts.length;
  const markedText = buildPdfPageMarkedText(fileName, pageTexts);
  const normalizedText = normalizeWhitespace(markedText);

  const fullText =
    normalizedText ||
    `[PDF 텍스트 레이어 없음] "${fileName}" — 배치도·입면도·스캔 문서는 첨부 PDF 비전 자료로 분석합니다.`;

  return {
    fullText,
    totalPages: totalPages > 0 ? totalPages : undefined,
    visionAssets: [
      {
        label: `${fileName} (전체 PDF)`,
        mediaType: "application/pdf",
        base64: buffer.toString("base64"),
      },
    ],
    warnings: [],
  };
}

function extractImageContent(buffer: Buffer, fileName: string, extension: string): DocumentContent {
  const mediaType = extension === "png" ? "image/png" : "image/jpeg";

  return {
    fullText: `[이미지 자료] "${fileName}" — 도면·스캔 문서·사진 속 글자와 그림을 비전 분석으로 읽습니다.`,
    visionAssets: [
      {
        label: fileName,
        mediaType,
        base64: buffer.toString("base64"),
      },
    ],
    warnings: [],
  };
}

function unsupportedExtractionNotice(fileName: string): string {
  const extension = getExtension(fileName) || "unknown";
  return `[본문 자동 추출 미지원: .${extension}] 파일명 "${fileName}" 및 형식 정보만 분석에 사용됩니다.`;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";

  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]);
  return normalizeWhitespace(texts.join(" "));
}

async function extractPptxContent(buffer: Buffer, fileName: string): Promise<{ fullText: string; totalPages: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort();

  const slideTexts: string[] = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.file(slidePath)?.async("string");
    if (!xml) continue;
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => match[1]);
    if (texts.length > 0) {
      slideTexts.push(texts.join(" "));
    }
  }

  return {
    fullText: buildSlideMarkedText(fileName, slideTexts),
    totalPages: slideTexts.length,
  };
}
