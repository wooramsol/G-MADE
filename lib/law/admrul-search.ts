import { buildAdmrulDetailUrl } from "../reference-links";
import { getCachedAdmrulSearch, setCachedAdmrulSearch } from "./cache";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";

export type AdmrulSearchHit = {
  admRulSeq: string;
  admRulId: string;
  title: string;
  ministry: string;
  enforcementDate: string;
  ruleType: string;
  sourceUrl: string;
};

type AdmrulSearchResponse = Record<string, unknown>;

export async function searchAdmruls(query: string, display = 5): Promise<AdmrulSearchHit[]> {
  const oc = getLawOc();
  const normalizedQuery = query.trim();
  if (!oc || !normalizedQuery) return [];

  const cached = getCachedAdmrulSearch(normalizedQuery, display);
  if (cached) return cached;

  const result = await lawGetJson<AdmrulSearchResponse>(
    "/DRF/lawSearch.do",
    {
      OC: oc,
      target: "admrul",
      type: "JSON",
      query: normalizedQuery,
      display: String(display),
      page: "1",
      nw: "1",
    },
    `행정규칙검색(${normalizedQuery})`,
  );

  if (!result.ok) {
    throw new Error(result.error ?? `행정규칙 검색에 실패했습니다. (${normalizedQuery})`);
  }

  const hits = parseAdmrulSearchHits(result.data);
  setCachedAdmrulSearch(normalizedQuery, display, hits);
  return hits;
}

function parseAdmrulSearchHits(payload: AdmrulSearchResponse): AdmrulSearchHit[] {
  const container = (payload.AdmRulSearch ?? payload.admRulSearch) as Record<string, unknown> | undefined;
  if (!container) return [];

  const ruleNode = container.admrul ?? container.Admrul;
  if (!ruleNode) return [];

  const rows = Array.isArray(ruleNode) ? ruleNode : [ruleNode];

  return rows
    .map((row) => mapAdmrulSearchHit(row as Record<string, unknown>))
    .filter((hit): hit is AdmrulSearchHit => hit !== null);
}

function mapAdmrulSearchHit(row: Record<string, unknown>): AdmrulSearchHit | null {
  const admRulSeq = pickString(row, ["행정규칙일련번호", "admRulSeq", "admRul id"]);
  const title = pickString(row, ["행정규칙명", "admRulName", "title"]);
  if (!admRulSeq || !title) return null;

  const admRulId = pickString(row, ["행정규칙ID", "admRulId"]) ?? admRulSeq;
  const ministry = pickString(row, ["소관부처명", "소관부처"]) ?? "";
  const enforcementDate = pickString(row, ["시행일자", "발령일자"]) ?? "";
  const ruleType = pickString(row, ["행정규칙종류", "행정규칙구분"]) ?? "";
  const detailLink = pickString(row, ["행정규칙상세링크"]);
  const sourceUrl = detailLink?.startsWith("http")
    ? detailLink
    : buildAdmrulDetailUrl(admRulSeq);
  if (!sourceUrl) return null;

  return {
    admRulSeq,
    admRulId,
    title,
    ministry,
    enforcementDate,
    ruleType,
    sourceUrl,
  };
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
