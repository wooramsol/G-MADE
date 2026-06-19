import { buildAdmbylReferenceUrl, isVerifiedLawGoKrDetailUrl } from "../reference-links";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";
import { sleepMs } from "./retry";
import type { AdmbylSearchHit } from "./admbyl-search";
import type { FetchedAdmrulReference } from "./admrul-articles";

type AdmbylServiceResponse = Record<string, unknown>;

export async function fetchAdmbylReferences(
  hits: AdmbylSearchHit[],
  maxAnnexes = 4,
): Promise<FetchedAdmrulReference[]> {
  const oc = getLawOc();
  if (!oc) return [];

  const references: FetchedAdmrulReference[] = [];
  const seen = new Set<string>();

  for (const [index, hit] of hits.slice(0, maxAnnexes).entries()) {
    if (seen.has(hit.bylSeq)) continue;
    seen.add(hit.bylSeq);

    if (index > 0) {
      await sleepMs(250);
    }

    const body = await fetchAdmbylBody(hit);
    if (body) {
      references.push(body);
      continue;
    }

    references.push({
      id: `admbyl-${hit.bylSeq}`,
      title: hit.relatedRuleTitle ? `${hit.relatedRuleTitle} ${hit.title}` : hit.title,
      section: hit.annexNumber ? `별표 ${hit.annexNumber}` : hit.annexKind || "별표·서식",
      summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}${hit.annexKind || "행정규칙 별표·서식"} (국가법령정보센터 실시간 조회)`,
      ministry: hit.ministry,
      enforcementDate: "",
      sourceUrl: hit.sourceUrl,
      source: "law.go.kr",
    });
  }

  return references.filter(
    (reference) =>
      isVerifiedLawGoKrDetailUrl(reference.sourceUrl) &&
      buildAdmbylReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
}

async function fetchAdmbylBody(hit: AdmbylSearchHit): Promise<FetchedAdmrulReference | null> {
  const oc = getLawOc();
  if (!oc) return null;

  const result = await lawGetJson<AdmbylServiceResponse>(
    "/DRF/lawService.do",
    {
      OC: oc,
      target: "admbyl",
      type: "JSON",
      ID: hit.bylSeq,
    },
    `별표서식본문(${hit.title})`,
  );

  if (!result.ok) return null;

  const content = extractAnnexText(result.data);
  const title = hit.relatedRuleTitle ? `${hit.relatedRuleTitle} ${hit.title}` : hit.title;
  const section = hit.annexNumber ? `별표 ${hit.annexNumber}` : hit.annexKind || "별표·서식";

  if (!content) return null;

  return {
    id: `admbyl-${hit.bylSeq}`,
    title,
    section,
    summary: truncate(cleanText(content), 480),
    ministry: hit.ministry,
    enforcementDate: "",
    sourceUrl: hit.sourceUrl,
    source: "law.go.kr",
  };
}

function extractAnnexText(payload: AdmbylServiceResponse): string | null {
  const direct = pickString(payload, ["별표내용", "별지내용", "서식내용"]);
  if (direct) return direct;

  const root = (payload.별표 ?? payload.Admbyl ?? payload.admbyl) as Record<string, unknown> | undefined;
  return pickString(root ?? {}, ["별표내용", "별지내용", "서식내용", "content"]);
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
