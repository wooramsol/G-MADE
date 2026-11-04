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

// 심의와 관련 있는 자치법규만 (예: "대기 위반업소 공개 조례" 같은 무관한 조례 제외)
const LANDSCAPE_KEYWORDS = ["경관", "공공디자인", "도시관리", "건축", "옥외광고", "도시계획", "군계획", "시계획"];

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

  // 국가법령정보센터 자치법규 검색 응답의 목록 키는 "law" (ordin 아님)
  const ruleNode = container.law ?? container.ordin ?? container.Ordin;
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
  const jurisdiction = pickString(row, ["지자체기관명", "지자체명", "소관부처명"]) ?? "";
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
  // "환경관련"처럼 다른 단어 안에 우연히 들어간 "경관"은 제외
  const cleaned = normalized.replace(/환경관/g, "");
  return LANDSCAPE_KEYWORDS.some((keyword) => cleaned.includes(keyword.replace(/\s+/g, "")));
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
