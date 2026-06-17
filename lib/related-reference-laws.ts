import { dedupeReferenceLaws, type ReferenceLawLike } from "./dedupe-reference-laws";
import type { EvaluationItem } from "./types";

const LAW_ID_KEYWORDS: Record<string, string[]> = {
  "law-landscape": ["경관의 법률", "경관법"],
  "law-ordinance": ["경관 조례", "조례"],
  "law-light": ["빛공해", "인공조명"],
  "law-universal": ["장애인", "편의증진"],
  "law-green": ["녹지", "도시공원"],
  "law-public-design": ["공공디자인"],
  "law-admin": ["행정절차"],
};

type EvaluationPreviewRow = {
  laws?: string[];
  rationale?: string;
  itemName?: string;
};

function normalizeLawText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function extractArticleNumber(article: string): string | null {
  const match = article.match(/제\s*(\d+)\s*조/);
  return match?.[1] ?? null;
}

/** AI가 인용한 문자열과 조회된 법령 레코드가 같은 조문인지 대략 비교합니다. */
export function lawMatchesCitation(law: ReferenceLawLike, citation: string): boolean {
  const normalizedCitation = normalizeLawText(citation);
  const normalizedTitle = normalizeLawText(law.title);
  const normalizedArticle = normalizeLawText(law.article);

  if (!normalizedCitation) return false;

  const titleMatches =
    normalizedCitation.includes(normalizedTitle) ||
    normalizedTitle.includes(normalizedCitation) ||
    normalizedCitation.includes(normalizedTitle.replace(/시행령$/, ""));

  if (!titleMatches) {
    const keywordHit = Object.values(LAW_ID_KEYWORDS)
      .flat()
      .some(
        (keyword) =>
          normalizedCitation.includes(normalizeLawText(keyword)) &&
          normalizedTitle.includes(normalizeLawText(keyword)),
      );
    if (!keywordHit) return false;
  }

  const articleNo = extractArticleNumber(law.article);
  if (!articleNo) return titleMatches;

  return normalizedCitation.includes(`제${articleNo}조`) || normalizedArticle.includes(`제${articleNo}조`);
}

function keywordsForEvaluationItems(items: EvaluationItem[]): string[] {
  const keywords = new Set<string>();

  for (const item of items) {
    for (const lawId of item.lawIds ?? []) {
      for (const keyword of LAW_ID_KEYWORDS[lawId] ?? []) {
        keywords.add(keyword);
      }
    }
  }

  return Array.from(keywords);
}

function matchesEvaluationItemKeywords(law: ReferenceLawLike, keywords: string[]): boolean {
  const normalizedTitle = normalizeLawText(law.title);
  return keywords.some((keyword) => normalizedTitle.includes(normalizeLawText(keyword)));
}

/** 평가 항목·AI 인용에 맞는 법령만 남깁니다. */
export function pickRelatedReferenceLaws<T extends ReferenceLawLike>(input: {
  pool: T[];
  evaluationPreview?: EvaluationPreviewRow[];
  evaluationItems?: EvaluationItem[];
  max?: number;
}): T[] {
  const max = input.max ?? 6;
  const pool = dedupeReferenceLaws(input.pool);
  if (pool.length === 0) return [];

  const citations = new Set<string>();
  for (const row of input.evaluationPreview ?? []) {
    for (const law of row.laws ?? []) {
      if (law.trim()) citations.add(law.trim());
    }
  }

  const citedMatches = pool.filter((law) =>
    Array.from(citations).some((citation) => lawMatchesCitation(law, citation)),
  );
  if (citedMatches.length > 0) {
    return dedupeReferenceLaws(citedMatches).slice(0, max);
  }

  const itemKeywords = keywordsForEvaluationItems(input.evaluationItems ?? []);
  if (itemKeywords.length > 0) {
    const itemMatches = pool.filter((law) => matchesEvaluationItemKeywords(law, itemKeywords));
    if (itemMatches.length > 0) {
      return dedupeReferenceLaws(itemMatches).slice(0, max);
    }
  }

  return pool.slice(0, Math.min(3, max));
}
