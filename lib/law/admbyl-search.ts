import { buildAdmbylDetailUrl } from "../reference-links";
import { getCachedAdmbylSearch, setCachedAdmbylSearch } from "./cache";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";

export type AdmbylSearchHit = {
  bylSeq: string;
  relatedAdmRulSeq: string;
  title: string;
  relatedRuleTitle: string;
  annexKind: string;
  ministry: string;
  annexNumber: string;
  sourceUrl: string;
  fileUrl: string | null;
};

export type AdmbylSearchOptions = {
  display?: number;
  /** 1: 별표 2: 서식 3: 별지 */
  kind?: "1" | "2" | "3";
};

type AdmbylSearchResponse = Record<string, unknown>;

export async function searchAdmbyls(
  query: string,
  options: AdmbylSearchOptions = {},
): Promise<AdmbylSearchHit[]> {
  const oc = getLawOc();
  const normalizedQuery = query.trim();
  const display = options.display ?? 5;
  if (!oc || !normalizedQuery) return [];

  const cached = getCachedAdmbylSearch(normalizedQuery, display, options.kind);
  if (cached) return cached;

  const params: Record<string, string> = {
    OC: oc,
    target: "admbyl",
    type: "JSON",
    query: normalizedQuery,
    display: String(display),
    page: "1",
    search: "1",
  };
  if (options.kind) {
    params.knd = options.kind;
  }

  const result = await lawGetJson<AdmbylSearchResponse>(
    "/DRF/lawSearch.do",
    params,
    `별표서식검색(${normalizedQuery})`,
  );

  if (!result.ok) {
    throw new Error(result.error ?? `별표·서식 검색에 실패했습니다. (${normalizedQuery})`);
  }

  const hits = parseAdmbylSearchHits(result.data);
  setCachedAdmbylSearch(normalizedQuery, display, hits, options.kind);
  return hits;
}

function parseAdmbylSearchHits(payload: AdmbylSearchResponse): AdmbylSearchHit[] {
  const container = (payload.AdmBylSearch ?? payload.admBylSearch) as Record<string, unknown> | undefined;
  if (!container) return [];

  const node = container.admbyl ?? container.Admbyl ?? container.admRulByl;
  if (!node) return [];

  const rows = Array.isArray(node) ? node : [node];

  return rows
    .map((row) => mapAdmbylSearchHit(row as Record<string, unknown>))
    .filter((hit): hit is AdmbylSearchHit => hit !== null);
}

function mapAdmbylSearchHit(row: Record<string, unknown>): AdmbylSearchHit | null {
  const bylSeq = pickString(row, ["별표일련번호", "bylSeq", "admrulbyl id"]);
  const title = pickString(row, ["별표명", "별표제목", "title"]);
  if (!bylSeq || !title) return null;

  const relatedAdmRulSeq = pickString(row, ["관련행정규칙일련번호"]) ?? "";
  const relatedRuleTitle = pickString(row, ["관련행정규칙명"]) ?? "";
  const annexKind = pickString(row, ["별표종류", "별표구분"]) ?? "";
  const ministry = pickString(row, ["소관부처명"]) ?? "";
  const annexNumber = pickString(row, ["별표번호"]) ?? "";
  const detailLink = pickString(row, ["별표행정규칙상세링크"]);
  const fileUrl = pickString(row, ["별표서식파일링크"]);
  const sourceUrl =
    detailLink?.startsWith("http")
      ? detailLink
      : relatedAdmRulSeq
        ? buildAdmbylDetailUrl(relatedAdmRulSeq, bylSeq)
        : buildAdmbylDetailUrl(bylSeq);

  if (!sourceUrl) return null;

  return {
    bylSeq,
    relatedAdmRulSeq,
    title,
    relatedRuleTitle,
    annexKind,
    ministry,
    annexNumber,
    sourceUrl,
    fileUrl: fileUrl?.startsWith("http") ? fileUrl : null,
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
