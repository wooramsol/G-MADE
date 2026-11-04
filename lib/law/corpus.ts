import { getLawOc } from "./config";
import { lawGetJson } from "./http";

/**
 * 법령·자치법규 "전문" 조문 코퍼스.
 * 예전에는 법령마다 미리 정한 조문 1개(대부분 제2조 정의)의 제목만 가져와 AI가 실제 기준을 볼 수 없었다.
 * 이제 법령 전체 조문(항·호·목 포함)을 받아 두고, 체크리스트 항목과 관련된 조문만 골라 원문을 전달한다.
 */

export type LawArticle = {
  /** 법령·조례 이름 (예: 경관법, 양평군 경관 조례) */
  lawTitle: string;
  kind: "law" | "ordin";
  /** 조문 번호 (예: "28", "10의2") */
  no: string;
  title: string;
  /** 항·호·목까지 이어 붙인 본문 */
  text: string;
  sourceUrl: string;
};

export type LawSourceRef =
  | { kind: "law"; id: string; title: string; sourceUrl: string }
  | { kind: "ordin"; mst: string; title: string; sourceUrl: string };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const memoryCache = new Map<string, { at: number; articles: LawArticle[] }>();

export async function loadLawArticles(source: LawSourceRef): Promise<LawArticle[]> {
  const key = source.kind === "law" ? `law:${source.id}` : `ordin:${source.mst}`;
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.articles;
  const oc = getLawOc();
  if (!oc) return [];

  const params: Record<string, string> =
    source.kind === "law"
      ? { OC: oc, target: "law", type: "JSON", ID: source.id }
      : { OC: oc, target: "ordin", type: "JSON", MST: source.mst };
  const result = await lawGetJson<Record<string, unknown>>("/DRF/lawService.do", params, `조문전문(${source.title})`);
  if (!result.ok) return [];
  const articles =
    source.kind === "law" ? parseLawArticles(result.data, source) : parseOrdinArticles(result.data, source);
  if (articles.length > 0) {
    if (memoryCache.size > 200) memoryCache.clear();
    memoryCache.set(key, { at: Date.now(), articles });
  }
  return articles;
}

function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value === undefined || value === null ? [] : [value as T];
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(str).join(" ");
  return "";
}

function clean(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 국가법령: 법령.조문.조문단위[] — 조문내용(제목줄) + 항[].항내용 + 호[].호내용 + 목[].목내용 */
export function parseLawArticles(payload: Record<string, unknown>, source: { title: string; sourceUrl: string }): LawArticle[] {
  const law = (payload["법령"] ?? payload.Law) as Record<string, unknown> | undefined;
  const root = law?.["조문"] as Record<string, unknown> | undefined;
  const units = asArray<Record<string, unknown>>(root?.["조문단위"]);
  const lawTitle = str((law?.["기본정보"] as Record<string, unknown> | undefined)?.["법령명_한글"]) || source.title;
  const articles: LawArticle[] = [];
  for (const unit of units) {
    if (str(unit["조문여부"]) && str(unit["조문여부"]) !== "조문") continue; // 장·절 제목 제외
    const no = str(unit["조문번호"]) + (str(unit["조문가지번호"]) ? `의${str(unit["조문가지번호"])}` : "");
    const title = str(unit["조문제목"]);
    const parts: string[] = [str(unit["조문내용"])];
    for (const hang of asArray<Record<string, unknown>>(unit["항"])) {
      parts.push(str(hang["항내용"]));
      for (const ho of asArray<Record<string, unknown>>(hang["호"])) {
        parts.push(str(ho["호내용"]));
        for (const mok of asArray<Record<string, unknown>>(ho["목"])) parts.push(str(mok["목내용"]));
      }
    }
    const text = clean(parts.join(" "));
    if (!no || !text) continue;
    articles.push({ lawTitle, kind: "law", no, title, text, sourceUrl: source.sourceUrl });
  }
  return articles;
}

/** 자치법규: LawService.조문.조[] — 조제목, 조내용(본문 전체), 조문여부 "Y" */
export function parseOrdinArticles(payload: Record<string, unknown>, source: { title: string; sourceUrl: string }): LawArticle[] {
  const service = (payload.LawService ?? payload["LawService"]) as Record<string, unknown> | undefined;
  const info = service?.["자치법규기본정보"] as Record<string, unknown> | undefined;
  const lawTitle = str(info?.["자치법규명"]) || source.title;
  const units = asArray<Record<string, unknown>>((service?.["조문"] as Record<string, unknown> | undefined)?.["조"]);
  const articles: LawArticle[] = [];
  for (const unit of units) {
    if (str(unit["조문여부"]) !== "Y") continue;
    const body = clean(str(unit["조내용"]));
    const match = body.match(/^제(\d+)조(?:의(\d+))?/);
    if (!match) continue;
    const no = match[2] ? `${match[1]}의${match[2]}` : match[1];
    articles.push({ lawTitle, kind: "ordin", no, title: str(unit["조제목"]), text: body, sourceUrl: source.sourceUrl });
  }
  return articles;
}

/** 심의 기준과 무관한 절차·벌칙 조문 (선정에서 제외) */
const PROCEDURAL_TITLE = /^(목적|정의|시행일|벌칙|과태료|양벌규정|권한의 위임|위임|위탁|수수료|청문|벌칙 적용에서 공무원 의제|다른 법률과의 관계|적용 범위|규제의 재검토|비밀 누설 금지|위원의 제척|회의록|수당|운영세칙|간사)/;

/** 항목 문구 → 조문 검색어 확장 (경관 심의에서 자주 쓰는 표현) */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/색채|색상|외벽색|도색/, ["색채", "색상", "외벽"]],
  [/야간|조명|빛|경관조명/, ["야간경관", "조명", "빛공해", "경관조명"]],
  [/광고|간판|옥외/, ["옥외광고물", "간판", "광고물"]],
  [/조경|녹지|식재|수목|녹화/, ["조경", "녹지", "식재", "녹화"]],
  [/스카이라인|높이|층수|규모|고층/, ["높이", "층수", "스카이라인", "규모"]],
  [/건축선|후퇴|이격|대지경계/, ["건축선", "후퇴", "이격거리"]],
  [/담장|울타리|펜스/, ["담장", "울타리"]],
  [/옹벽|절토|성토|비탈|사면|지형/, ["옹벽", "절토", "성토", "비탈면", "지형"]],
  [/보행|가로|공개공지|보도/, ["보행", "가로", "공개공지", "보도"]],
  [/옥상|지붕|설비|실외기/, ["옥상", "지붕", "설비"]],
  [/조망|경관축|통경축|시야|전망/, ["조망", "통경축", "경관축"]],
  [/재료|마감|소재|재질/, ["재료", "마감", "재질"]],
  [/주차|차량/, ["주차"]],
  [/공공디자인|공공시설물|시설물/, ["공공디자인", "공공시설물"]],
  [/자연경관|산림|하천|수변/, ["자연경관", "산림", "하천", "수변"]],
  [/역사|문화재|전통|한옥/, ["역사문화", "문화재", "전통"]],
];

const STOPWORDS = new Set([
  "계획", "확보", "고려", "검토", "여부", "있는", "하는", "위한", "통한", "대한", "관련", "적정", "적절", "조화", "주변",
  "경관", "건축물", "시설", "형성", "제시", "반영", "설치", "필요", "경우", "등의", "및", "또는", "등",
]);

function tokensOf(text: string): string[] {
  const words = text.match(/[가-힣A-Za-z]{2,}/g) ?? [];
  const tokens = new Set<string>();
  for (const word of words) {
    const stem = word.replace(/(을|를|이|가|은|는|의|에|와|과|로|으로|에서|하여|하고|하는|한|된|될|토록|도록)$/u, "");
    if (stem.length >= 2 && !STOPWORDS.has(stem)) tokens.add(stem);
  }
  for (const [pattern, extra] of SYNONYMS) if (pattern.test(text)) extra.forEach((token) => tokens.add(token));
  return [...tokens];
}

function scoreArticle(article: LawArticle, tokens: string[]): number {
  if (PROCEDURAL_TITLE.test(article.title)) return 0;
  let score = 0;
  for (const token of tokens) {
    if (article.title.includes(token)) score += 4;
    else if (article.text.includes(token)) score += 1;
  }
  // 조례는 지역 실무 기준이라 가중
  if (article.kind === "ordin" && score > 0) score += 1;
  return score;
}

/**
 * 체크리스트 항목마다 관련 조문을 골라 합친다 (항목당 최대 perItem개, 전체 최대 limit개).
 * 반환: 선정 조문과 항목 id → 조문 키 매핑
 */
export function selectRelevantArticles(
  articles: LawArticle[],
  items: Array<{ id: string; text: string; category?: string }>,
  options: { perItem?: number; limit?: number; minScore?: number } = {},
): { articles: LawArticle[]; byItem: Map<string, string[]> } {
  const perItem = options.perItem ?? 2;
  const limit = options.limit ?? 24;
  const minScore = options.minScore ?? 3;
  const votes = new Map<string, { article: LawArticle; score: number }>();
  const byItem = new Map<string, string[]>();
  for (const item of items) {
    const tokens = tokensOf(`${item.category ?? ""} ${item.text}`);
    const ranked = articles
      .map((article) => ({ article, score: scoreArticle(article, tokens) }))
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, perItem);
    byItem.set(item.id, ranked.map((entry) => articleKey(entry.article)));
    for (const entry of ranked) {
      const key = articleKey(entry.article);
      const prev = votes.get(key);
      votes.set(key, { article: entry.article, score: (prev?.score ?? 0) + entry.score });
    }
  }
  const selected = [...votes.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.article);
  return { articles: selected, byItem };
}

export function articleKey(article: Pick<LawArticle, "lawTitle" | "no">): string {
  return `${article.lawTitle}#${article.no}`;
}

export function articleLabel(article: Pick<LawArticle, "no" | "title">): string {
  return article.title ? `제${article.no}조(${article.title})` : `제${article.no}조`;
}
