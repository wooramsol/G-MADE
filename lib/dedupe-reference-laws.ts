export type ReferenceLawLike = {
  title: string;
  article: string;
  summary?: string;
  sourceUrl?: string;
};

function normalizeLawKey(title: string, article: string): string {
  return `${title.replace(/\s+/g, "").toLowerCase()}|${article.replace(/\s+/g, "").trim()}`;
}

/** 동일 법령·조문이 여러 경로(검색/API/기본값)에서 반복될 때 한 번만 남깁니다. */
export function dedupeReferenceLaws<T extends ReferenceLawLike>(laws: T[]): T[] {
  const seen = new Set<string>();

  return laws.filter((law) => {
    const key = normalizeLawKey(law.title, law.article);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toStoredReferenceLaws<T extends ReferenceLawLike>(laws: T[], max = 6): T[] {
  return dedupeReferenceLaws(laws).slice(0, max);
}
