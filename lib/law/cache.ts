import type { LawSearchHit } from "./search";

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const searchCache = new Map<string, CacheEntry<LawSearchHit[]>>();

function buildSearchCacheKey(query: string, display: number): string {
  return `${query.trim().toLowerCase()}::${display}`;
}

export function getCachedLawSearch(query: string, display: number): LawSearchHit[] | null {
  const key = buildSearchCacheKey(query, display);
  const entry = searchCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }

  return entry.value.map((hit) => ({ ...hit }));
}

export function setCachedLawSearch(query: string, display: number, hits: LawSearchHit[]): void {
  const key = buildSearchCacheKey(query, display);
  searchCache.set(key, {
    value: hits.map((hit) => ({ ...hit })),
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}
