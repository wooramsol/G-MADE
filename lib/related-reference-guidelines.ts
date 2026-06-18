import { dedupeReferenceLaws, type ReferenceLawLike } from "./dedupe-reference-laws";
import type { EvaluationItem } from "./types";

const GUIDELINE_ID_KEYWORDS: Record<string, string[]> = {
  "guide-skyline": ["스카이라인", "경관계획"],
  "guide-facade": ["입면", "경관심의운영"],
  "guide-color": ["색채", "서울색"],
  "guide-night": ["야간", "조명"],
  "guide-walk": ["보행"],
  "guide-green": ["녹지"],
  "guide-public-space": ["공공공간", "공공디자인"],
  "guide-document": ["제출", "체크리스트", "경관심의운영"],
};

export type ReferenceGuidelineLike = {
  title: string;
  section: string;
  summary?: string;
  sourceUrl?: string;
};

type EvaluationPreviewRow = {
  guidelines?: string[];
  rationale?: string;
  itemName?: string;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function dedupeReferenceGuidelines<T extends ReferenceGuidelineLike>(guidelines: T[]): T[] {
  const seen = new Set<string>();

  return guidelines.filter((guide) => {
    const key = `${normalizeText(guide.title)}|${normalizeText(guide.section)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** AI가 인용한 문자열과 조회된 행정규칙·지침 레코드가 같은 항목인지 대략 비교합니다. */
export function guidelineMatchesCitation(guide: ReferenceGuidelineLike, citation: string): boolean {
  const normalizedCitation = normalizeText(citation);
  const normalizedTitle = normalizeText(guide.title);
  const normalizedSection = normalizeText(guide.section);

  if (!normalizedCitation) return false;

  const titleMatches =
    normalizedCitation.includes(normalizedTitle) ||
    normalizedTitle.includes(normalizedCitation) ||
    normalizedCitation.includes(normalizedTitle.replace(/지침$/, ""));

  if (!titleMatches) {
    const keywordHit = Object.values(GUIDELINE_ID_KEYWORDS)
      .flat()
      .some(
        (keyword) =>
          normalizedCitation.includes(normalizeText(keyword)) &&
          normalizedTitle.includes(normalizeText(keyword)),
      );
    if (!keywordHit) return false;
  }

  if (!normalizedSection || normalizedSection === "본문") return titleMatches;

  return (
    normalizedCitation.includes(normalizedSection) ||
    normalizedSection.includes(normalizedCitation) ||
    titleMatches
  );
}

function keywordsForEvaluationItems(items: EvaluationItem[]): string[] {
  const keywords = new Set<string>();

  for (const item of items) {
    for (const guidelineId of item.guidelineIds ?? []) {
      for (const keyword of GUIDELINE_ID_KEYWORDS[guidelineId] ?? []) {
        keywords.add(keyword);
      }
    }
  }

  return Array.from(keywords);
}

function matchesEvaluationItemKeywords(guide: ReferenceGuidelineLike, keywords: string[]): boolean {
  const normalizedTitle = normalizeText(guide.title);
  const normalizedSummary = normalizeText(guide.summary ?? "");
  return keywords.some(
    (keyword) =>
      normalizedTitle.includes(normalizeText(keyword)) ||
      normalizedSummary.includes(normalizeText(keyword)),
  );
}

/** 평가 항목·AI 인용에 맞는 행정규칙·지침만 남깁니다. */
export function pickRelatedReferenceGuidelines<T extends ReferenceGuidelineLike>(input: {
  pool: T[];
  evaluationPreview?: EvaluationPreviewRow[];
  evaluationItems?: EvaluationItem[];
  max?: number;
}): T[] {
  const max = input.max ?? 4;
  const pool = dedupeReferenceGuidelines(input.pool);
  if (pool.length === 0) return [];

  const citations = new Set<string>();
  for (const row of input.evaluationPreview ?? []) {
    for (const guide of row.guidelines ?? []) {
      if (guide.trim()) citations.add(guide.trim());
    }
  }

  const citedMatches = pool.filter((guide) =>
    Array.from(citations).some((citation) => guidelineMatchesCitation(guide, citation)),
  );
  if (citedMatches.length > 0) {
    return dedupeReferenceGuidelines(citedMatches).slice(0, max);
  }

  const itemKeywords = keywordsForEvaluationItems(input.evaluationItems ?? []);
  if (itemKeywords.length > 0) {
    const itemMatches = pool.filter((guide) => matchesEvaluationItemKeywords(guide, itemKeywords));
    if (itemMatches.length > 0) {
      return dedupeReferenceGuidelines(itemMatches).slice(0, max);
    }
  }

  return pool.slice(0, Math.min(2, max));
}

export function toStoredReferenceGuidelines<T extends ReferenceGuidelineLike>(
  guidelines: T[],
  max = 4,
): T[] {
  return dedupeReferenceGuidelines(guidelines).slice(0, max);
}
