import { buildAdmrulReferenceUrl, isVerifiedLawGoKrDetailUrl } from "../reference-links";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";
import { sleepMs } from "./retry";
import type { AdmrulSearchHit } from "./admrul-search";

export type FetchedAdmrulReference = {
  id: string;
  title: string;
  section: string;
  summary: string;
  ministry: string;
  enforcementDate: string;
  sourceUrl: string;
  source: "law.go.kr" | "demo-fallback";
};

type AdmrulServiceResponse = Record<string, unknown>;

const KEY_SECTION_HINTS: Array<{ keyword: string; section: string }> = [
  { keyword: "경관심의운영지침", section: "제1장 총칙" },
  { keyword: "경관계획수립지침", section: "제1장 총칙" },
  { keyword: "공공디자인", section: "제1장 총칙" },
];

export async function fetchAdmrulReferences(
  hits: AdmrulSearchHit[],
  maxRules = 5,
): Promise<FetchedAdmrulReference[]> {
  const oc = getLawOc();
  if (!oc) return [];

  const references: FetchedAdmrulReference[] = [];
  const seen = new Set<string>();

  for (const [index, hit] of hits.slice(0, maxRules).entries()) {
    if (seen.has(hit.admRulSeq)) continue;
    seen.add(hit.admRulSeq);

    if (index > 0) {
      await sleepMs(250);
    }

    const body = await fetchAdmrulBody(hit);
    if (body) {
      references.push(body);
      continue;
    }

    references.push({
      id: `admrul-${hit.admRulSeq}`,
      title: hit.title,
      section: pickSectionHint(hit.title),
      summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}${hit.ruleType || "행정규칙"} (국가법령정보센터 실시간 조회)`,
      ministry: hit.ministry,
      enforcementDate: hit.enforcementDate,
      sourceUrl: hit.sourceUrl,
      source: "law.go.kr",
    });
  }

  return references.filter(
    (reference) =>
      isVerifiedLawGoKrDetailUrl(reference.sourceUrl) &&
      buildAdmrulReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
}

async function fetchAdmrulBody(hit: AdmrulSearchHit): Promise<FetchedAdmrulReference | null> {
  const oc = getLawOc();
  if (!oc) return null;

  const result = await lawGetJson<AdmrulServiceResponse>(
    "/DRF/lawService.do",
    {
      OC: oc,
      target: "admrul",
      type: "JSON",
      ID: hit.admRulSeq,
    },
    `행정규칙본문(${hit.title})`,
  );

  if (!result.ok) return null;

  return parseAdmrulBody(result.data, hit);
}

function parseAdmrulBody(payload: AdmrulServiceResponse, hit: AdmrulSearchHit): FetchedAdmrulReference | null {
  const root = (payload.행정규칙 ?? payload.Admrul ?? payload.admrul) as Record<string, unknown> | undefined;
  const info = (root?.기본정보 ?? root) as Record<string, unknown> | undefined;

  const title = pickString(info ?? payload, ["행정규칙명", "admRulName"]) ?? hit.title;
  const ministry = pickString(info ?? payload, ["소관부처명"]) ?? hit.ministry;
  const enforcementDate = pickString(info ?? payload, ["시행일자", "발령일자"]) ?? hit.enforcementDate;
  const articleText = extractArticleText(payload, root);
  const section = extractSectionLabel(articleText) ?? pickSectionHint(title);
  const summary = articleText
    ? truncate(cleanText(articleText), 480)
    : `${ministry ? `${ministry} 소관 ` : ""}${hit.ruleType || "행정규칙"} 본문`;

  return {
    id: `admrul-${hit.admRulSeq}`,
    title,
    section,
    summary,
    ministry,
    enforcementDate,
    sourceUrl: hit.sourceUrl,
    source: "law.go.kr",
  };
}

function extractArticleText(payload: AdmrulServiceResponse, root?: Record<string, unknown>): string | null {
  const direct = pickString(payload, ["조문내용"]);
  if (direct) return direct;

  const fromRoot = pickString(root ?? {}, ["조문내용", "별표내용"]);
  if (fromRoot) return fromRoot;

  const articles = root?.조문 ?? payload.조문;
  if (!articles) return null;

  const articleRoot = (articles as Record<string, unknown>).조문단위 ?? articles;
  const units = Array.isArray(articleRoot) ? articleRoot : articleRoot ? [articleRoot] : [];

  for (const unit of units) {
    if (!unit || typeof unit !== "object") continue;
    const content = pickString(unit as Record<string, unknown>, ["조문내용", "조문내용여부", "content"]);
    if (content) return content;
  }

  return null;
}

function extractSectionLabel(text: string | null): string | null {
  if (!text) return null;

  const chapter = text.match(/제\s*\d+\s*장[^\n<]{0,24}/);
  if (chapter) return chapter[0].replace(/\s+/g, " ").trim();

  const article = text.match(/제\s*\d+\s*조(?:\([^)]+\))?/);
  if (article) return article[0].replace(/\s+/g, " ").trim();

  return null;
}

function pickSectionHint(title: string): string {
  const sorted = [...KEY_SECTION_HINTS].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const entry of sorted) {
    if (title.includes(entry.keyword)) return entry.section;
  }
  return "본문";
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
