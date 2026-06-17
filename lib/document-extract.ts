import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

const PREVIEW_LIMIT = 8000;
const PDF_MAX_PAGES = 40;

const TEXT_EXTRACTABLE = new Set(["pdf", "pptx", "docx", "txt", "md"]);

export function isTextExtractableFile(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTRACTABLE.has(extension);
}

/** PDF·PPTX·DOCX·텍스트 파일에서 본문 미리보기를 생성합니다. */
export async function extractDocumentText(buffer: Buffer, fileName: string): Promise<string> {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  try {
    if (extension === "pdf") {
      return await extractPdfText(buffer, fileName);
    }
    if (extension === "pptx") {
      return await extractPptxText(buffer);
    }
    if (extension === "docx") {
      return await extractDocxText(buffer);
    }
    if (extension === "txt" || extension === "md") {
      return normalizeText(buffer.toString("utf8"));
    }
  } catch {
    return unsupportedExtractionNotice(fileName);
  }

  return unsupportedExtractionNotice(fileName);
}

async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ first: PDF_MAX_PAGES });
    const text = normalizeText(result.text ?? "");

    if (!text) {
      return `[PDF 텍스트 추출 결과 없음] "${fileName}" — 스캔 이미지 PDF이거나 텍스트 레이어가 없을 수 있습니다.`;
    }

    return text;
  } finally {
    await parser.destroy();
  }
}

function unsupportedExtractionNotice(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "unknown";
  return `[본문 자동 추출 미지원: .${extension}] 파일명 "${fileName}" 및 형식 정보만 분석에 사용됩니다.`;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";

  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]);
  return normalizeText(texts.join(" "));
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort();

  const chunks: string[] = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.file(slidePath)?.async("string");
    if (!xml) continue;
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => match[1]);
    if (texts.length > 0) {
      chunks.push(texts.join(" "));
    }
  }

  return normalizeText(chunks.join("\n"));
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);
}
