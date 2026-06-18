import type { AdmrulSearchHit } from "./admrul-search";
import type { LawSearchHit } from "./search";

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const lawSearchCache = new Map<string, CacheEntry<LawSearchHit[]>>();
const admrulSearchCache = new Map<string, CacheEntry<AdmrulSearchHit[]>>();

function buildSearchCacheKey(query: string, display: number): string {
  return `${query.trim().toLowerCase()}::${display}`;
}

export function getCachedLawSearch(query: string, display: number): LawSearchHit[] | null {
  const key = buildSearchCacheKey(query, display);
  const entry = lawSearchCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    lawSearchCache.delete(key);
    return null;
  }

  return entry.value.map((hit) => ({ ...hit }));
}

export function setCachedLawSearch(query: string, display: number, hits: LawSearchHit[]): void {
  const key = buildSearchCacheKey(query, display);
  lawSearchCache.set(key, {
    value: hits.map((hit) => ({ ...hit })),
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

export function getCachedAdmrulSearch(query: string, display: number): AdmrulSearchHit[] | null {
  const key = buildSearchCacheKey(query, display);
  const entry = admrulSearchCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    admrulSearchCache.delete(key);
    return null;
  }

  return entry.value.map((hit) => ({ ...hit }));
}

export function setCachedAdmrulSearch(query: string, display: number, hits: AdmrulSearchHit[]): void {
  const key = buildSearchCacheKey(query, display);
  admrulSearchCache.set(key, {
    value: hits.map((hit) => ({ ...hit })),
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}
