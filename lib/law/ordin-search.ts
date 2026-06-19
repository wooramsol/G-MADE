import { buildOrdinDetailUrl } from "../reference-links";
import { getCachedOrdinSearch, setCachedOrdinSearch } from "./cache";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";

export type OrdinSearchHit = {
  ordinSeq: string;
  ordinId: string;
  title: string;
  jurisdiction: string;
  enforcementDate: string;
  ordinanceType: string;
  sourceUrl: string;
};

export type OrdinSearchOptions = {
  orgCode?: string | null;
  display?: number;
};

type OrdinSearchResponse = Record<string, unknown>;

const LANDSCAPE_KEYWORDS = ["경관", "공공디자인", "도시관리", "건축", "조례"];

export async function searchOrdins(
  query: string,
  options: OrdinSearchOptions = {},
): Promise<OrdinSearchHit[]> {
  const oc = getLawOc();
  const normalizedQuery = query.trim();
  const display = options.display ?? 5;
  if (!oc || !normalizedQuery) return [];

  const cached = getCachedOrdinSearch(normalizedQuery, display, options.orgCode);
  if (cached) return cached;

  const params: Record<string, string> = {
    OC: oc,
    target: "ordin",
    type: "JSON",
    query: normalizedQuery,
    display: String(display),
    page: "1",
    nw: "1",
  };
  if (options.orgCode) {
    params.org = options.orgCode;
  }

  const result = await lawGetJson<OrdinSearchResponse>(
    "/DRF/lawSearch.do",
    params,
    `자치법규검색(${normalizedQuery})`,
  );

  if (!result.ok) {
    throw new Error(result.error ?? `자치법규 검색에 실패했습니다. (${normalizedQuery})`);
  }

  const hits = parseOrdinSearchHits(result.data).filter(isLandscapeRelatedOrdinance);
  setCachedOrdinSearch(normalizedQuery, display, hits, options.orgCode);
  return hits;
}

function parseOrdinSearchHits(payload: OrdinSearchResponse): OrdinSearchHit[] {
  const container = (payload.OrdinSearch ?? payload.ordinSearch) as Record<string, unknown> | undefined;
  if (!container) return [];

  const ruleNode = container.ordin ?? container.Ordin;
  if (!ruleNode) return [];

  const rows = Array.isArray(ruleNode) ? ruleNode : [ruleNode];

  return rows
    .map((row) => mapOrdinSearchHit(row as Record<string, unknown>))
    .filter((hit): hit is OrdinSearchHit => hit !== null);
}

function mapOrdinSearchHit(row: Record<string, unknown>): OrdinSearchHit | null {
  const ordinSeq = pickString(row, ["자치법규일련번호", "ordinSeq", "ordin id"]);
  const title = pickString(row, ["자치법규명", "ordinName", "title"]);
  if (!ordinSeq || !title) return null;

  const ordinId = pickString(row, ["자치법규ID", "ordinId"]) ?? ordinSeq;
  const jurisdiction = pickString(row, ["자치법규종류", "지자체명", "소관부처명"]) ?? "";
  const enforcementDate = pickString(row, ["시행일자", "공포일자", "발령일자"]) ?? "";
  const ordinanceType = pickString(row, ["자치법규종류", "법령구분명"]) ?? "조례";
  const detailLink = pickString(row, ["자치법규상세링크"]);
  const sourceUrl = detailLink?.startsWith("http") ? detailLink : buildOrdinDetailUrl(ordinSeq);
  if (!sourceUrl) return null;

  return {
    ordinSeq,
    ordinId,
    title,
    jurisdiction,
    enforcementDate,
    ordinanceType,
    sourceUrl,
  };
}

function isLandscapeRelatedOrdinance(hit: OrdinSearchHit): boolean {
  const normalized = hit.title.replace(/\s+/g, "");
  return LANDSCAPE_KEYWORDS.some((keyword) => normalized.includes(keyword.replace(/\s+/g, "")));
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
