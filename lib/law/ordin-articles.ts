import { buildOrdinReferenceUrl, isVerifiedLawGoKrDetailUrl } from "../reference-links";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";
import { sleepMs } from "./retry";
import type { OrdinSearchHit } from "./ordin-search";
import type { FetchedLawReference } from "./articles";

type OrdinServiceResponse = Record<string, unknown>;

const KEY_ARTICLE_HINTS = ["18", "12", "26", "2", "1"];

export async function fetchOrdinReferences(
  hits: OrdinSearchHit[],
  maxOrdinances = 6,
): Promise<FetchedLawReference[]> {
  const oc = getLawOc();
  if (!oc) return [];

  const references: FetchedLawReference[] = [];
  const seen = new Set<string>();

  for (const [index, hit] of hits.slice(0, maxOrdinances).entries()) {
    if (seen.has(hit.ordinSeq)) continue;
    seen.add(hit.ordinSeq);

    if (index > 0) {
      await sleepMs(250);
    }

    const body = await fetchOrdinArticleSnippet(hit);
    if (body) {
      references.push(body);
      continue;
    }

    references.push({
      id: `ordin-${hit.ordinSeq}`,
      title: hit.title,
      article: hit.enforcementDate ? `시행 ${formatDate(hit.enforcementDate)}` : "현행",
      summary: `${hit.jurisdiction ? `${hit.jurisdiction} ` : ""}자치법규 (국가법령정보센터 실시간 조회)`,
      ministry: hit.jurisdiction,
      enforcementDate: hit.enforcementDate,
      sourceUrl: hit.sourceUrl,
      source: "law.go.kr",
    });
  }

  return references.filter(
    (reference) =>
      isVerifiedLawGoKrDetailUrl(reference.sourceUrl) &&
      buildOrdinReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
}

async function fetchOrdinArticleSnippet(hit: OrdinSearchHit): Promise<FetchedLawReference | null> {
  const oc = getLawOc();
  if (!oc) return null;

  for (const [index, articleNo] of KEY_ARTICLE_HINTS.slice(0, 2).entries()) {
    if (index > 0) {
      await sleepMs(200);
    }

    const result = await lawGetJson<OrdinServiceResponse>(
      "/DRF/lawService.do",
      {
        OC: oc,
        target: "ordin",
        type: "JSON",
        ID: hit.ordinSeq,
        JO: `${articleNo.padStart(4, "0")}00`,
      },
      `자치법규조문(${hit.title} 제${articleNo}조)`,
    );

    if (!result.ok) continue;

    const parsed = parseOrdinArticleSnippet(result.data, hit, articleNo);
    if (parsed) return parsed;
  }

  const bodyResult = await lawGetJson<OrdinServiceResponse>(
    "/DRF/lawService.do",
    {
      OC: oc,
      target: "ordin",
      type: "JSON",
      ID: hit.ordinSeq,
    },
    `자치법규본문(${hit.title})`,
  );

  if (!bodyResult.ok) return null;

  return parseOrdinBodySnippet(bodyResult.data, hit);
}

function parseOrdinArticleSnippet(
  payload: OrdinServiceResponse,
  hit: OrdinSearchHit,
  articleNo: string,
): FetchedLawReference | null {
  const snippet = extractOrdinArticleText(payload);
  if (!snippet) return null;

  const { content, title: articleTitle } = snippet;

  return {
    id: `ordin-${hit.ordinSeq}-${articleNo}`,
    title: hit.title,
    article: articleTitle ? `제${articleNo}조(${articleTitle})` : `제${articleNo}조`,
    summary: truncate(cleanText(content), 480),
    ministry: hit.jurisdiction,
    enforcementDate: hit.enforcementDate,
    sourceUrl: hit.sourceUrl,
    source: "law.go.kr",
  };
}

function parseOrdinBodySnippet(payload: OrdinServiceResponse, hit: OrdinSearchHit): FetchedLawReference | null {
  const snippet = extractOrdinArticleText(payload);
  if (!snippet) return null;

  const section = extractSectionLabel(snippet.content) ?? "본문";

  return {
    id: `ordin-${hit.ordinSeq}`,
    title: hit.title,
    article: section,
    summary: truncate(cleanText(snippet.content), 480),
    ministry: hit.jurisdiction,
    enforcementDate: hit.enforcementDate,
    sourceUrl: hit.sourceUrl,
    source: "law.go.kr",
  };
}

function extractOrdinArticleText(payload: OrdinServiceResponse): { content: string; title: string | null } | null {
  const root = (payload.자치법규 ?? payload.Ordin ?? payload.ordin) as Record<string, unknown> | undefined;
  const articles = root?.조문 ?? payload.조문;
  if (!articles) {
    const direct = pickString(payload, ["조내용", "조문내용"]);
    if (direct) return { content: direct, title: null };
    return null;
  }

  const articleRoot = (articles as Record<string, unknown>).조문단위 ?? articles;
  const units = Array.isArray(articleRoot) ? articleRoot : articleRoot ? [articleRoot] : [];

  for (const unit of units) {
    if (!unit || typeof unit !== "object") continue;
    const row = unit as Record<string, unknown>;
    const content = pickString(row, ["조내용", "조문내용", "content"]);
    if (!content) continue;

    const title = pickString(row, ["조제목", "조문제목"]) ?? null;
    return { content, title };
  }

  return null;
}

function extractSectionLabel(text: string): string | null {
  const article = text.match(/제\s*\d+\s*조(?:\([^)]+\))?/);
  return article ? article[0].replace(/\s+/g, " ").trim() : null;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
