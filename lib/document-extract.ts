import JSZip from "jszip";

const PREVIEW_LIMIT = 8000;

/** PDF/DOCX 추출은 제거. PPTX·텍스트 파일만 미리보기를 생성합니다. */
export async function extractDocumentText(buffer: Buffer, fileName: string): Promise<string> {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  try {
    if (extension === "pptx") {
      return await extractPptxText(buffer);
    }
    if (extension === "txt" || extension === "md") {
      return normalizeText(buffer.toString("utf8"));
    }
  } catch {
    return "";
  }

  return "";
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
