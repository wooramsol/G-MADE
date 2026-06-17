import { isVerifiedLawGoKrDetailUrl } from "../reference-links";
import { getLawOc } from "./config";
import { lawGetJson } from "./http";
import { sleepMs } from "./retry";
import type { LawSearchHit } from "./search";

export type FetchedLawReference = {
  id: string;
  title: string;
  article: string;
  summary: string;
  ministry: string;
  enforcementDate: string;
  sourceUrl: string;
  source: "law.go.kr" | "demo-fallback";
};

type LawServiceResponse = Record<string, unknown>;

const KEY_ARTICLE_HINTS: Array<{ keyword: string; articles: string[] }> = [
  { keyword: "경관의 법률", articles: ["28", "2", "14"] },
  { keyword: "경관법 시행령", articles: ["14", "15", "2"] },
  { keyword: "공공디자인의 진흥에 관한 법률 시행규칙", articles: ["2", "3"] },
  { keyword: "공공디자인의 진흥에 관한 법률 시행령", articles: ["10", "2"] },
  { keyword: "공공디자인", articles: ["10", "9", "2"] },
  { keyword: "빛공해", articles: ["11", "2"] },
  { keyword: "녹지", articles: ["35", "14", "2"] },
  { keyword: "도시공원", articles: ["35", "2"] },
  { keyword: "장애인", articles: ["8", "2"] },
  { keyword: "경관 조례", articles: ["18", "12", "2"] },
];

export async function fetchLawReferences(hits: LawSearchHit[], maxLaws = 5): Promise<FetchedLawReference[]> {
  const oc = getLawOc();
  if (!oc) return [];

  const references: FetchedLawReference[] = [];
  const seen = new Set<string>();

  for (const [index, hit] of hits.slice(0, maxLaws).entries()) {
    if (seen.has(hit.lawId)) continue;
    seen.add(hit.lawId);

    if (index > 0) {
      await sleepMs(250);
    }

    const articles = await fetchLawArticleSnippets(hit);
    if (articles.length > 0) {
      references.push(articles[0]);
      continue;
    }

    references.push({
      id: `law-${hit.lawId}`,
      title: hit.title,
      article: hit.enforcementDate ? `시행 ${formatDate(hit.enforcementDate)}` : "현행",
      summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}${hit.lawType || "법령"} (국가법령정보센터 실시간 조회)`,
      ministry: hit.ministry,
      enforcementDate: hit.enforcementDate,
      sourceUrl: hit.sourceUrl,
      source: "law.go.kr",
    });
  }

  return references.filter((reference) => isVerifiedLawGoKrDetailUrl(reference.sourceUrl));
}

async function fetchLawArticleSnippets(hit: LawSearchHit): Promise<FetchedLawReference[]> {
  const oc = getLawOc();
  if (!oc) return [];

  const hints = pickArticleHints(hit.title);
  const snippets: FetchedLawReference[] = [];

  for (const [index, articleNo] of hints.slice(0, 2).entries()) {
    if (index > 0) {
      await sleepMs(200);
    }

    const jo = articleNo.padStart(4, "0") + "00";
    const result = await lawGetJson<LawServiceResponse>(
      "/DRF/lawService.do",
      {
        OC: oc,
        target: "law",
        type: "JSON",
        ID: hit.lawId,
        JO: jo,
      },
      `법령조문(${hit.shortTitle} 제${articleNo}조)`,
    );

    if (!result.ok) continue;

    const parsed = parseArticleSnippet(result.data, hit, articleNo);
    if (parsed) snippets.push(parsed);
  }

  return snippets;
}

function parseArticleSnippet(
  payload: LawServiceResponse,
  hit: LawSearchHit,
  articleNo: string,
): FetchedLawReference | null {
  const law = (payload.법령 ?? payload.Law) as Record<string, unknown> | undefined;
  if (!law) return null;

  const articleRoot = (law.조문 ?? law.Articles) as Record<string, unknown> | undefined;
  const units = articleRoot?.조문단위 ?? articleRoot?.Article;
  const unitList = Array.isArray(units) ? units : units ? [units] : [];

  for (const unit of unitList) {
    if (!unit || typeof unit !== "object") continue;
    const row = unit as Record<string, unknown>;
    const content = pickString(row, ["조문내용", "조문내용여부", "content"]);
    if (!content) continue;

    const title = pickString(row, ["조문제목", "조문제목여부"]) ?? "";
    const summary = truncate(cleanLawText(content), 480);

    return {
      id: `law-${hit.lawId}-${articleNo}`,
      title: hit.title,
      article: title ? `제${articleNo}조(${title})` : `제${articleNo}조`,
      summary,
      ministry: hit.ministry,
      enforcementDate: hit.enforcementDate,
      sourceUrl: hit.sourceUrl,
      source: "law.go.kr",
    };
  }

  return null;
}

function pickArticleHints(title: string): string[] {
  const sorted = [...KEY_ARTICLE_HINTS].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const entry of sorted) {
    if (title.includes(entry.keyword)) return entry.articles;
  }
  return ["2", "1"];
}

function cleanLawText(text: string): string {
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
  }
  return null;
}
