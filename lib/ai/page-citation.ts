import { normalizeDocumentText, sliceGraphemeRange, truncateGraphemes } from "../document-text-utils";
import type { UploadedFileSummary } from "./analysis-types";

/** 추출 본문에 삽입하는 페이지 구분 마커 (`--- 「file.pdf」 p.3 ---`) */
export const PAGE_MARKER_LINE_PATTERN = /^---\s*「([^」]+)」\s*p\.(\d+)\s*---$/m;

export function buildPdfPageMarkedText(fileName: string, pageTexts: string[]): string {
  return pageTexts
    .map((pageText, index) => {
      const body = normalizeDocumentText(pageText ?? "");
      if (!body) return "";
      return `--- 「${fileName}」 p.${index + 1} ---\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function buildSlideMarkedText(fileName: string, slideTexts: string[]): string {
  return slideTexts
    .map((slideText, index) => {
      const body = normalizeDocumentText(slideText ?? "");
      if (!body) return "";
      return `--- 「${fileName}」 슬라이드 ${index + 1} ---\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function formatPageReference(fileName: string, page: number): string {
  return `「${fileName}」 p.${page}`;
}

export function findPageMarkerBefore(
  corpus: string,
  position: number,
): { fileName: string; page: number } | null {
  const before = corpus.slice(0, position);
  const matches = [...before.matchAll(/---\s*「([^」]+)」\s*p\.(\d+)\s*---/g)];
  const last = matches.at(-1);
  if (!last?.[1] || !last[2]) return null;
  return { fileName: last[1], page: Number(last[2]) };
}

export function extractEvidenceWithPage(
  corpus: string,
  keywords: string[],
  radius = 90,
): { snippet: string; pageRef: string | null } {
  const normalizedCorpus = corpus.normalize("NFC");
  const lowerCorpus = normalizedCorpus.toLowerCase();

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) continue;

    const idx = lowerCorpus.indexOf(trimmed.toLowerCase());
    if (idx < 0) continue;

    const start = Math.max(0, idx - radius);
    const end = Math.min(normalizedCorpus.length, idx + trimmed.length + radius);
    const snippet = normalizeDocumentText(sliceGraphemeRange(normalizedCorpus, start, end));
    if (snippet.length < 12) continue;

    const marker = findPageMarkerBefore(normalizedCorpus, idx);
    const pageRef = marker ? formatPageReference(marker.fileName, marker.page) : null;
    const clipped = truncateGraphemes(snippet, 160);
    const suffix = segmentCount(snippet) > 160 ? "…" : "";

    return { snippet: `${clipped}${suffix}`, pageRef };
  }

  return { snippet: "", pageRef: null };
}

function segmentCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
    return [...segmenter.segment(text)].length;
  }
  return [...text].length;
}

export function extractMentionedPageCitations(text: string): Array<{ fileName: string; page: number }> {
  const citations: Array<{ fileName: string; page: number }> = [];

  for (const match of text.matchAll(/「([^」]+)」\s*(?:p\.|제?\s*)?(\d{1,3})\s*(?:면|페이지|page)?/gi)) {
    const fileName = match[1]?.trim();
    const page = Number(match[2]);
    if (fileName && Number.isFinite(page) && page > 0) {
      citations.push({ fileName, page });
    }
  }

  for (const match of text.matchAll(/(?:p\.|제?\s*)(\d{1,3})\s*(?:면|페이지)/gi)) {
    const page = Number(match[1]);
    if (Number.isFinite(page) && page > 0) {
      citations.push({ fileName: "", page });
    }
  }

  return citations;
}

export function pageCitationIsKnown(
  citation: { fileName: string; page: number },
  files: UploadedFileSummary[],
): boolean {
  const matchedFile = citation.fileName
    ? files.find(
        (file) =>
          file.originalName === citation.fileName ||
          file.originalName.includes(citation.fileName) ||
          citation.fileName.includes(file.originalName),
      )
    : files.find((file) => (file.totalPages ?? 0) >= citation.page);

  if (!matchedFile?.totalPages) {
    return citation.page <= 999;
  }

  return citation.page >= 1 && citation.page <= matchedFile.totalPages;
}
