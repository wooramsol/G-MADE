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

    let searchFrom = 0;
    while (searchFrom < lowerCorpus.length) {
      const idx = lowerCorpus.indexOf(trimmed.toLowerCase(), searchFrom);
      if (idx < 0) break;
      searchFrom = idx + trimmed.length;

      const start = Math.max(0, idx - radius);
      const end = Math.min(normalizedCorpus.length, idx + trimmed.length + radius);
      const snippet = normalizeDocumentText(sliceGraphemeRange(normalizedCorpus, start, end));
      if (snippet.length < 12) continue;

      const marker = findPageMarkerBefore(normalizedCorpus, idx);
      if (marker) {
        const pageStart = normalizedCorpus.lastIndexOf(`--- 「${marker.fileName}」 p.${marker.page} ---`, idx);
        const nextMarker = normalizedCorpus.indexOf("--- 「", idx + 1);
        const pageEnd = nextMarker > idx ? nextMarker : normalizedCorpus.length;
        const pageText = pageStart >= 0 ? normalizedCorpus.slice(pageStart, pageEnd) : "";
        const isTocKeyword = /목차|차례/.test(trimmed);
        if (!isTocKeyword && pageText && isTocPageText(pageText.replace(/^---[^]*?---\n?/, ""))) {
          continue;
        }
      }

      const pageRef = marker ? formatPageReference(marker.fileName, marker.page) : null;
      const clipped = truncateGraphemes(snippet, 160);
      const suffix = segmentCount(snippet) > 160 ? "…" : "";

      return { snippet: `${clipped}${suffix}`, pageRef };
    }
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

export type PageSlice = {
  fileName: string;
  page: number;
  text: string;
};

const DRAWING_SECTION_KEYWORDS = [
  "배치도",
  "입면도",
  "단면도",
  "조감도",
  "투시도",
  "색채계획",
  "야간경관",
  "보행동선",
  "주차",
  "건축계획",
  "경관체크리스트",
  "공공디자인",
] as const;

/** PDF 본문 마커 기준으로 페이지별 텍스트를 분리합니다. */
export function parsePageSlices(files: UploadedFileSummary[]): PageSlice[] {
  const slices: PageSlice[] = [];

  for (const file of files) {
    const corpus = file.extractedTextPreview ?? "";
    if (!corpus.trim()) continue;

    const parts = corpus.split(/(?=---\s*「[^」]+」\s*p\.\d+\s*---)/g);
    for (const part of parts) {
      const header = part.match(/^---\s*「([^」]+)」\s*p\.(\d+)\s*---\n?/);
      if (!header?.[1] || !header[2]) continue;
      const text = part.slice(header[0].length).trim();
      if (!text) continue;
      slices.push({
        fileName: header[1],
        page: Number(header[2]),
        text,
      });
    }
  }

  return slices;
}

/** 목차·차례 페이지인지 판별합니다. */
export function isTocPageText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const head = normalized.slice(0, 120);
  if (/^(목차|차례|CONTENTS|TABLE\s+OF\s+CONTENTS)/i.test(head)) return true;

  const sectionEntries = normalized.match(/\d{1,2}\s*[.)]\s*[가-힣A-Za-z]/g) ?? [];
  const hasTocKeyword = /목차|차례/.test(normalized.slice(0, 200));
  return sectionEntries.length >= 5 && (hasTocKeyword || normalized.length < 900);
}

function isCriteriaLikeText(text: string): boolean {
  return /평가기준|주변\s*스카이라인|과도한\s*단절|기준\s*미달|저촉\s*검토|미기재|불명확하여/.test(text);
}

function extractSectionLabel(text: string): string | null {
  for (const keyword of DRAWING_SECTION_KEYWORDS) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

/** 본문에서 섹션·도면 키워드가 실제로 등장하는 페이지를 찾습니다 (목차 페이지 제외). */
export function findPageForSection(
  files: UploadedFileSummary[],
  keywords: string[],
): { fileName: string; page: number; sectionLabel: string } | null {
  const slices = parsePageSlices(files);
  const normalizedKeywords = keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length >= 2);

  for (const slice of slices) {
    if (isTocPageText(slice.text)) continue;

    for (const keyword of normalizedKeywords) {
      if (!slice.text.toLowerCase().includes(keyword.toLowerCase())) continue;
      const sectionLabel = extractSectionLabel(slice.text) ?? keyword;
      if (sectionLabel === "목차" || sectionLabel === "차례") continue;
      return { fileName: slice.fileName, page: slice.page, sectionLabel };
    }
  }

  return null;
}

function formatCompactEvidence(page: number, sectionLabel?: string): string {
  if (sectionLabel) return `p.${page} ${sectionLabel}`;
  return `p.${page}`;
}

/** 근거 문구의 페이지·섹션을 PDF 본문과 대조해 보정합니다. */
export function resolvePageEvidence(
  files: UploadedFileSummary[],
  evidence: string,
  contentHint = "",
): string {
  const trimmed = evidence.trim();
  if (!trimmed) return "";

  if (isCriteriaLikeText(trimmed)) {
    const hint = `${contentHint} ${trimmed}`;
    const sectionLabel = extractSectionLabel(hint);
    const located = findPageForSection(files, sectionLabel ? [sectionLabel] : DRAWING_SECTION_KEYWORDS as unknown as string[]);
    return located ? formatCompactEvidence(located.page, located.sectionLabel) : sectionLabel ?? "";
  }

  const pageMatch = trimmed.match(/\bp\.(\d+)\b/i);
  const page = pageMatch ? Number(pageMatch[1]) : null;
  const sectionLabel = extractSectionLabel(trimmed) ?? extractSectionLabel(contentHint);

  if (!page) {
    if (sectionLabel) {
      const located = findPageForSection(files, [sectionLabel]);
      return located ? formatCompactEvidence(located.page, located.sectionLabel) : sectionLabel;
    }
    return trimmed;
  }

  const slices = parsePageSlices(files);
  const slice = slices.find((entry) => entry.page === page);
  if (!slice) return trimmed;

  if (isTocPageText(slice.text)) {
    const keywords = sectionLabel ? [sectionLabel] : DRAWING_SECTION_KEYWORDS as unknown as string[];
    const located = findPageForSection(files, keywords);
    if (located) return formatCompactEvidence(located.page, located.sectionLabel);
    return sectionLabel ?? "";
  }

  if (sectionLabel && !slice.text.includes(sectionLabel)) {
    const located = findPageForSection(files, [sectionLabel]);
    if (located) return formatCompactEvidence(located.page, located.sectionLabel);
  }

  return sectionLabel ? formatCompactEvidence(page, sectionLabel) : `p.${page}`;
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

  if (citation.page < 1 || citation.page > matchedFile.totalPages) {
    return false;
  }

  const slices = parsePageSlices([matchedFile]);
  const slice = slices.find((entry) => entry.page === citation.page);
  if (!slice) return true;

  if (isTocPageText(slice.text)) {
    return false;
  }

  return true;
}

/** documentSections 요약에서 페이지 힌트 마커 코퍼스를 생성합니다. */
export function buildPageHintCorpusFromDocumentSections(
  documentSections: Array<{ label: string; summary: string }>,
  defaultFileName: string,
): string {
  const markers: string[] = [];
  const seen = new Set<string>();

  for (const section of documentSections) {
    const label = section.label.trim();
    const summary = section.summary.trim();
    if (!summary) continue;

    const isTocSection = /목차|차례/.test(label);

    for (const match of summary.matchAll(/(?:「([^」]+)」\s*)?p\.(\d{1,3})/gi)) {
      const fileName = match[1]?.trim() || defaultFileName;
      const page = Number(match[2]);
      if (!fileName || !Number.isFinite(page) || page < 1) continue;

      const key = `${fileName}:${page}:${isTocSection ? "toc" : label}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const body = isTocSection
        ? `목차\n${summary}`
        : `${label}\n${summary}`;
      markers.push(`--- 「${fileName}」 p.${page} ---\n${body}`);
    }
  }

  return markers.join("\n\n");
}
