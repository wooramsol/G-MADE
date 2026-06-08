import { buildLawGoKrLawSearchUrl } from "../reference-links";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";

export type LawSearchHit = {
  lawId: string;
  mst: string;
  title: string;
  shortTitle: string;
  ministry: string;
  enforcementDate: string;
  lawType: string;
  sourceUrl: string;
};

type LawSearchResponse = Record<string, unknown>;

export async function searchLaws(query: string, display = 5): Promise<LawSearchHit[]> {
  const oc = getLawOc();
  if (!oc || !query.trim()) return [];

  const result = await lawGetJson<LawSearchResponse>(
    "/DRF/lawSearch.do",
    {
      OC: oc,
      target: "law",
      type: "JSON",
      query: query.trim(),
      display: String(display),
      page: "1",
    },
    `법령검색(${query})`,
  );

  if (!result.ok) return [];

  return parseLawSearchHits(result.data);
}

function parseLawSearchHits(payload: LawSearchResponse): LawSearchHit[] {
  const container = (payload.LawSearch ?? payload.lawSearch) as Record<string, unknown> | undefined;
  if (!container) return [];

  const lawNode = container.law;
  if (!lawNode) return [];

  const rows = Array.isArray(lawNode) ? lawNode : [lawNode];

  return rows
    .map((row) => mapLawSearchHit(row as Record<string, unknown>))
    .filter((hit): hit is LawSearchHit => hit !== null);
}

function mapLawSearchHit(row: Record<string, unknown>): LawSearchHit | null {
  const lawId = pickString(row, ["법령ID", "lawId", "법령일련번호"]);
  const title = pickString(row, ["법령명한글", "법령명", "lawName"]);
  if (!lawId || !title) return null;

  const mst = pickString(row, ["법령일련번호", "MST", "mst"]) ?? lawId;
  const shortTitle = pickString(row, ["법령약칭명", "약칭"]) ?? title;
  const ministry = pickString(row, ["소관부처명", "소관부처"]) ?? "";
  const enforcementDate = pickString(row, ["시행일자", "시행일"]) ?? "";
  const lawType = pickString(row, ["법령구분명", "법령구분"]) ?? "";

  return {
    lawId,
    mst,
    title,
    shortTitle,
    ministry,
    enforcementDate,
    lawType,
    sourceUrl: buildLawGoKrLawSearchUrl(title),
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
