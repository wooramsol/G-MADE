import JSZip from "jszip";

/** PDF는 100장 이상 심의자료를 고려해 상한을 넉넉히 둡니다. */
const PDF_TEXT_CHAR_LIMIT = 300_000;
/** DOCX·PPTX 등은 전체 페이지 추출 후 이 길이까지 AI에 전달합니다. */
const DEFAULT_TEXT_CHAR_LIMIT = 80_000;

const TEXT_EXTRACTABLE = new Set(["pdf", "pptx", "docx", "txt", "md"]);

export function isTextExtractableFile(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTRACTABLE.has(extension);
}

/** PDF·PPTX·DOCX·텍스트 파일에서 본문을 추출합니다. */
export async function extractDocumentText(buffer: Buffer, fileName: string): Promise<string> {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  try {
    if (extension === "pdf") {
      return await extractPdfText(buffer, fileName);
    }
    if (extension === "pptx") {
      return limitExtractedText(await extractPptxText(buffer), DEFAULT_TEXT_CHAR_LIMIT);
    }
    if (extension === "docx") {
      return limitExtractedText(await extractDocxText(buffer), DEFAULT_TEXT_CHAR_LIMIT);
    }
    if (extension === "txt" || extension === "md") {
      return limitExtractedText(normalizeWhitespace(buffer.toString("utf8")), DEFAULT_TEXT_CHAR_LIMIT);
    }
  } catch {
    return unsupportedExtractionNotice(fileName);
  }

  return unsupportedExtractionNotice(fileName);
}

async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const normalized = normalizeWhitespace(text ?? "");

  if (!normalized) {
    return `[PDF 텍스트 추출 결과 없음] "${fileName}" — 스캔 이미지 PDF이거나 텍스트 레이어가 없을 수 있습니다.`;
  }

  return limitExtractedText(normalized, PDF_TEXT_CHAR_LIMIT);
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
  return normalizeWhitespace(texts.join(" "));
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

  return normalizeWhitespace(chunks.join("\n"));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function limitExtractedText(text: string, charLimit: number): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= charLimit) {
    return normalized;
  }

  return `${normalized.slice(0, charLimit)}\n\n[본문이 길어 앞부분 ${charLimit.toLocaleString("ko-KR")}자만 분석에 사용됩니다.]`;
}
