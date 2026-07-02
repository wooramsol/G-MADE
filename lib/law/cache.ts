import type { AdmbylSearchHit } from "./admbyl-search";
import type { AdmrulSearchHit } from "./admrul-search";
import type { LawSearchHit } from "./search";
import type { OrdinSearchHit } from "./ordin-search";

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const lawSearchCache = new Map<string, CacheEntry<LawSearchHit[]>>();
const admrulSearchCache = new Map<string, CacheEntry<AdmrulSearchHit[]>>();
const ordinSearchCache = new Map<string, CacheEntry<OrdinSearchHit[]>>();
const admbylSearchCache = new Map<string, CacheEntry<AdmbylSearchHit[]>>();

function buildSearchCacheKey(query: string, display: number, scope = ""): string {
  return `${query.trim().toLowerCase()}::${display}::${scope}`;
}

export function getCachedLawSearch(query: string, display: number): LawSearchHit[] | null {
  return readCache(lawSearchCache, buildSearchCacheKey(query, display));
}

export function setCachedLawSearch(query: string, display: number, hits: LawSearchHit[]): void {
  writeCache(lawSearchCache, buildSearchCacheKey(query, display), hits);
}

export function getCachedAdmrulSearch(query: string, display: number): AdmrulSearchHit[] | null {
  return readCache(admrulSearchCache, buildSearchCacheKey(query, display));
}

export function setCachedAdmrulSearch(query: string, display: number, hits: AdmrulSearchHit[]): void {
  writeCache(admrulSearchCache, buildSearchCacheKey(query, display), hits);
}

export function getCachedOrdinSearch(
  query: string,
  display: number,
  orgCode?: string | null,
): OrdinSearchHit[] | null {
  return readCache(ordinSearchCache, buildSearchCacheKey(query, display, orgCode ?? ""));
}

export function setCachedOrdinSearch(
  query: string,
  display: number,
  hits: OrdinSearchHit[],
  orgCode?: string | null,
): void {
  writeCache(ordinSearchCache, buildSearchCacheKey(query, display, orgCode ?? ""), hits);
}

export function getCachedAdmbylSearch(
  query: string,
  display: number,
  kind?: string,
): AdmbylSearchHit[] | null {
  return readCache(admbylSearchCache, buildSearchCacheKey(query, display, kind ?? ""));
}

export function setCachedAdmbylSearch(
  query: string,
  display: number,
  hits: AdmbylSearchHit[],
  kind?: string,
): void {
  writeCache(admbylSearchCache, buildSearchCacheKey(query, display, kind ?? ""), hits);
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cloneEntry(entry.value);
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  // 장기 실행 인스턴스에서 캐시가 무한히 커지지 않도록 상한을 둔다 (가장 오래된 항목부터 제거).
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    }
    while (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  cache.set(key, {
    value: cloneEntry(value),
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

function cloneEntry<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => ({ ...item })) as T;
  }
  return value;
}
