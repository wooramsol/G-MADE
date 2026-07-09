import { normalizeDocumentText, sliceGraphemeRange, truncateGraphemes } from "../document-text-utils";
import type { UploadedFileSummary } from "./analysis-types";

/** 추출 본문에 삽입하는 페이지 구분 마커 (`--- 「file.pdf」 p.3 ---`) */
export const PAGE_MARKER_LINE_PATTERN = /^---\s*「([^」]+)」\s*p\.(\d+)\s*---$/m;

const DRAWING_CONTENT_MARKERS =
  /㎡|m²|mm|cm|층|주차|동선|면적|규모|위치|진입|난간|계단|조경|식재|색채|재료|마감|조도|규격|체크|표|도면|\d+\s*(?:㎡|m²|m|mm|cm|층|대|면|%|kW|lux)/;

const SECTION_DIVIDER_HEADING_PATTERN =
  /^\d{1,2}\s+(?:사업개요|경관자원|경관특성|건축계획|건축개요|배치|입면|조감|색채|야간|보행|공공|주변|녹지|경관|현황|조경|체크리스트)/;

const CONTENT_HINT_KEYWORDS = [
  "옥외",
  "옥상",
  "보행",
  "동선",
  "주차",
  "조명",
  "야간",
  "색채",
  "입면",
  "배치",
  "조감",
  "스카이라인",
  "식재",
  "녹지",
  "경관",
  "장애인",
  "보행약자",
  "난간",
  "계단",
] as const;

const MIN_DRAWING_PAGE_SCORE = 3;

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

function pageBodyFromSlice(pageText: string): string {
  return pageText.replace(/^---[^]*?---\n?/, "");
}

function isNonDrawablePageText(text: string, sectionLabel?: string): boolean {
  return isTocPageText(text) || isTitleOnlyPageText(text, sectionLabel);
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
        const pageBody = pageBodyFromSlice(pageText);
        const isTocKeyword = /목차|차례/.test(trimmed);
        if (!isTocKeyword && pageBody && isNonDrawablePageText(pageBody, trimmed)) {
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

/** 섹션 제목만 있고 실제 도면·본문이 없는 페이지인지 판별합니다. */
export function isTitleOnlyPageText(text: string, sectionLabel?: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (isTocPageText(normalized)) return true;

  if (SECTION_DIVIDER_HEADING_PATTERN.test(normalized) && normalized.length <= 80) return true;
  if (/^\d{1,2}\s+[가-힣][가-힣\s·및과의]{2,48}$/.test(normalized) && normalized.length <= 60) return true;

  if (DRAWING_CONTENT_MARKERS.test(normalized) && normalized.length >= 15) return false;
  if (normalized.length >= 400) return false;

  if (
    /^(?:제?\s*)?\d{1,2}\s*(?:[.)-]\s*)?(?:장|절|편)?\s*(?:배치도|입면도|단면도|조감도|투시도|색채|야간|보행|건축|경관|공공)\s*$/i.test(
      normalized,
    )
  ) {
    return true;
  }

  if (normalized.length < 16 && !DRAWING_CONTENT_MARKERS.test(normalized)) return true;

  const keywordHits = DRAWING_SECTION_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  if (keywordHits >= 3 && normalized.length < 350) return true;

  if (
    sectionLabel &&
    (DRAWING_SECTION_KEYWORDS as readonly string[]).includes(sectionLabel) &&
    normalized.length < 100
  ) {
    const withoutLabel = normalized
      .replace(new RegExp(sectionLabel, "gi"), "")
      .replace(/\d+[\s.)-]/g, " ")
      .trim();
    if (withoutLabel.length < 20 && !DRAWING_CONTENT_MARKERS.test(withoutLabel)) return true;
  }

  return false;
}

function extractKeywordsFromContentHint(contentHint: string): string[] {
  const keywords = new Set<string>();

  for (const keyword of CONTENT_HINT_KEYWORDS) {
    if (contentHint.includes(keyword)) keywords.add(keyword);
  }

  for (const keyword of DRAWING_SECTION_KEYWORDS) {
    if (contentHint.includes(keyword)) keywords.add(keyword);
  }

  return [...keywords];
}

function findNextSubstantivePage(
  slices: PageSlice[],
  afterPage: number,
  keyword = "도면",
): PageSlice | null {
  const candidates = slices
    .filter((slice) => slice.page > afterPage)
    .sort((left, right) => left.page - right.page);

  for (const slice of candidates) {
    if (scoreDrawingPageText(slice.text, keyword) >= MIN_DRAWING_PAGE_SCORE) {
      return slice;
    }
  }

  return null;
}

export function scoreDrawingPageText(text: string, keyword: string): number {
  if (isNonDrawablePageText(text, keyword)) return -1;

  const normalized = text.replace(/\s+/g, " ").trim();
  let score = 0;

  score += Math.min(Math.floor(normalized.length / 60), 8);
  if (DRAWING_CONTENT_MARKERS.test(normalized)) score += 4;
  if (normalized.toLowerCase().includes(keyword.toLowerCase())) score += 3;
  if (extractSectionLabel(normalized) === keyword) score += 2;

  const keywordHits = DRAWING_SECTION_KEYWORDS.filter((entry) => normalized.includes(entry)).length;
  if (keywordHits >= 3 && normalized.length < 350) score -= 6;

  return score;
}

function isCriteriaLikeText(text: string): boolean {
  return /평가기준|주변\s*스카이라인|과도한\s*단절|기준\s*미달|저촉\s*검토|미기재|불명확하여/.test(text);
}

export function extractSectionLabel(text: string): string | null {
  for (const keyword of DRAWING_SECTION_KEYWORDS) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

/** 본문에서 섹션·도면 키워드가 실제로 등장하는 페이지를 찾습니다 (목차·제목 페이지 제외). */
export function findPageForSection(
  files: UploadedFileSummary[],
  keywords: string[],
  excludePages: number[] = [],
): { fileName: string; page: number; sectionLabel: string } | null {
  const slices = parsePageSlices(files);
  const normalizedKeywords = keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length >= 2);
  const excluded = new Set(excludePages);

  let best: { fileName: string; page: number; sectionLabel: string; score: number } | null = null;

  for (const slice of slices) {
    if (excluded.has(slice.page)) continue;

    for (const keyword of normalizedKeywords) {
      if (!slice.text.toLowerCase().includes(keyword.toLowerCase())) continue;

      const sectionLabel = extractSectionLabel(slice.text) ?? keyword;
      if (sectionLabel === "목차" || sectionLabel === "차례") continue;

      const score = scoreDrawingPageText(slice.text, keyword);
      if (score < MIN_DRAWING_PAGE_SCORE) continue;

      if (!best || score > best.score) {
        best = { fileName: slice.fileName, page: slice.page, sectionLabel, score };
      }
    }
  }

  if (!best) return null;
  return { fileName: best.fileName, page: best.page, sectionLabel: best.sectionLabel };
}

function formatCompactEvidence(page: number, sectionLabel?: string): string {
  if (sectionLabel) return `p.${page} ${sectionLabel}`;
  return `p.${page}`;
}

function locateEvidencePage(
  files: UploadedFileSummary[],
  keywords: string[],
  afterPage?: number,
  excludePages: number[] = [],
): { fileName: string; page: number; sectionLabel: string } | null {
  const located = findPageForSection(files, keywords, excludePages);
  if (located) return located;

  if (afterPage == null) return null;

  const slices = parsePageSlices(files);
  const next = findNextSubstantivePage(slices, afterPage, keywords[0] ?? "도면");
  if (!next || excludePages.includes(next.page)) return null;

  return {
    fileName: next.fileName,
    page: next.page,
    sectionLabel: extractSectionLabel(next.text) ?? keywords[0] ?? "도면",
  };
}

/** 근거 문구의 페이지·섹션을 PDF 본문과 대조해 보정합니다. */
export function resolvePageEvidence(
  files: UploadedFileSummary[],
  evidence: string,
  contentHint = "",
  itemKeywords: string[] = [],
): string {
  const trimmed = evidence.trim();
  const hintKeywords = [
    ...itemKeywords,
    ...extractKeywordsFromContentHint(contentHint),
  ].filter((keyword, index, array) => array.indexOf(keyword) === index);

  if (!trimmed) {
    if (hintKeywords.length === 0) return "";
    const located = locateEvidencePage(files, hintKeywords);
    return located ? formatCompactEvidence(located.page, located.sectionLabel) : "";
  }

  if (isCriteriaLikeText(trimmed)) {
    const hint = `${contentHint} ${trimmed}`;
    const sectionLabel = extractSectionLabel(hint);
    const combinedKeywords = extractKeywordsFromContentHint(hint);
    const keywords = [
      ...itemKeywords,
      ...(sectionLabel ? [sectionLabel] : []),
      ...combinedKeywords,
    ].filter((keyword, index, array) => array.indexOf(keyword) === index);
    const located = locateEvidencePage(files, keywords.length > 0 ? keywords : [...DRAWING_SECTION_KEYWORDS]);
    return located ? formatCompactEvidence(located.page, located.sectionLabel) : sectionLabel ?? "";
  }

  const pageMatch = trimmed.match(/\bp\.(\d+)\b/i);
  const page = pageMatch ? Number(pageMatch[1]) : null;
  const evidenceSectionLabel = extractSectionLabel(trimmed) ?? extractSectionLabel(contentHint);

  if (!page) {
    const keywords = evidenceSectionLabel
      ? [evidenceSectionLabel, ...hintKeywords]
      : hintKeywords;
    if (keywords.length === 0) return trimmed;
    const located = locateEvidencePage(files, keywords);
    return located ? formatCompactEvidence(located.page, located.sectionLabel) : evidenceSectionLabel ?? trimmed;
  }

  const slices = parsePageSlices(files);
  const slice = slices.find((entry) => entry.page === page);

  const relocationKeywords = evidenceSectionLabel
    ? [evidenceSectionLabel, ...hintKeywords]
    : hintKeywords.length > 0
      ? hintKeywords
      : [...DRAWING_SECTION_KEYWORDS];

  const pageMatchesHint =
    slice &&
    (hintKeywords.length === 0 ||
      hintKeywords.some(
        (keyword) =>
          slice.text.includes(keyword) && scoreDrawingPageText(slice.text, keyword) >= MIN_DRAWING_PAGE_SCORE,
      ));

  if (!slice || isNonDrawablePageText(slice.text, evidenceSectionLabel ?? undefined) || !pageMatchesHint) {
    const contentKeywords =
      hintKeywords.length > 0
        ? hintKeywords
        : relocationKeywords;
    const located = locateEvidencePage(files, contentKeywords, page, page != null ? [page] : []);
    if (located) return formatCompactEvidence(located.page, located.sectionLabel);
    if (hintKeywords.length > 0) {
      const hintLocated = locateEvidencePage(files, hintKeywords, page, page != null ? [page] : []);
      if (hintLocated) return formatCompactEvidence(hintLocated.page, hintLocated.sectionLabel);
    }
    return evidenceSectionLabel ?? "";
  }

  if (evidenceSectionLabel && !slice.text.includes(evidenceSectionLabel)) {
    const located = locateEvidencePage(files, relocationKeywords, page);
    if (located) return formatCompactEvidence(located.page, located.sectionLabel);
    if (isTitleOnlyPageText(slice.text, evidenceSectionLabel)) return evidenceSectionLabel;
  }

  if (evidenceSectionLabel && scoreDrawingPageText(slice.text, evidenceSectionLabel) < MIN_DRAWING_PAGE_SCORE) {
    const located = locateEvidencePage(files, relocationKeywords, page);
    if (located) return formatCompactEvidence(located.page, located.sectionLabel);
    return evidenceSectionLabel;
  }

  const primaryKeyword = hintKeywords[0] ?? evidenceSectionLabel ?? "도면";
  if (scoreDrawingPageText(slice.text, primaryKeyword) < MIN_DRAWING_PAGE_SCORE) {
    const located = locateEvidencePage(files, relocationKeywords, page);
    if (located) return formatCompactEvidence(located.page, located.sectionLabel);
    return evidenceSectionLabel ?? "";
  }

  const resolvedLabel = evidenceSectionLabel ?? extractSectionLabel(slice.text);
  return resolvedLabel ? formatCompactEvidence(page, resolvedLabel) : `p.${page}`;
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

  if (isNonDrawablePageText(slice.text)) {
    return false;
  }

  return scoreDrawingPageText(slice.text, extractSectionLabel(slice.text) ?? "도면") >= MIN_DRAWING_PAGE_SCORE;
}

function collectPageLabelsFromSections(
  documentSections: Array<{ label: string; summary: string }>,
  defaultFileName: string,
): Map<string, string[]> {
  const pageLabels = new Map<string, string[]>();

  for (const section of documentSections) {
    const label = section.label.trim();
    const summary = section.summary.trim();
    if (!summary) continue;

    for (const match of summary.matchAll(/(?:「([^」]+)」\s*)?p\.(\d{1,3})/gi)) {
      const fileName = match[1]?.trim() || defaultFileName;
      const page = Number(match[2]);
      if (!fileName || !Number.isFinite(page) || page < 1) continue;

      const key = `${fileName}:${page}`;
      const labels = pageLabels.get(key) ?? [];
      if (!labels.includes(label)) labels.push(label);
      pageLabels.set(key, labels);
    }
  }

  return pageLabels;
}

/** documentSections 요약에서 페이지 힌트 마커 코퍼스를 생성합니다. */
export function buildPageHintCorpusFromDocumentSections(
  documentSections: Array<{ label: string; summary: string }>,
  defaultFileName: string,
): string {
  const markers: string[] = [];
  const seen = new Set<string>();
  const pageLabels = collectPageLabelsFromSections(documentSections, defaultFileName);

  for (const section of documentSections) {
    const label = section.label.trim();
    const summary = section.summary.trim();
    if (!summary) continue;

    const isTocSection = /목차|차례/.test(label);

    for (const match of summary.matchAll(/(?:「([^」]+)」\s*)?p\.(\d{1,3})/gi)) {
      const fileName = match[1]?.trim() || defaultFileName;
      const page = Number(match[2]);
      if (!fileName || !Number.isFinite(page) || page < 1) continue;

      const key = `${fileName}:${page}`;
      const labelsOnPage = pageLabels.get(key) ?? [];
      const isIndexPage = labelsOnPage.length >= 3;

      const markerKey = `${key}:${isTocSection || isIndexPage ? "index" : label}`;
      if (seen.has(markerKey)) continue;
      seen.add(markerKey);

      const body = isTocSection || isIndexPage
        ? `목차\n${summary}`
        : `${label}\n${summary}`;
      markers.push(`--- 「${fileName}」 p.${page} ---\n${body}`);
    }
  }

  return markers.join("\n\n");
}

/** 분석 시 저장할 PDF 페이지별 텍스트 색인(용량 제한). */
export function buildCompactPageCorpus(files: UploadedFileSummary[], maxChars = 48_000): string {
  const parts: string[] = [];

  for (const file of files) {
    const slices = parsePageSlices([file]);
    for (const slice of slices) {
      const clipped = slice.text.length > 600 ? `${slice.text.slice(0, 600)}…` : slice.text;
      parts.push(`--- 「${slice.fileName}」 p.${slice.page} ---\n${clipped}`);
    }
  }

  return parts.join("\n\n").slice(0, maxChars);
}
