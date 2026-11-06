import { isR2Configured, r2GetObject, r2PutObject } from "../r2-storage";
import { getLawOc } from "./config";
import { extractHwpText, replaceHwpBullets } from "./hwp-text";
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
  /** 긴 심의기준 조문을 호 단위로 나눈 경우의 호 (예: { no: "3", name: "색채" }) */
  part?: { no: string; name: string };
  /** 항·호·목까지 이어 붙인 본문 */
  text: string;
  sourceUrl: string;
};

export type LawSourceRef =
  | { kind: "law"; id: string; title: string; sourceUrl: string }
  | { kind: "ordin"; mst: string; title: string; sourceUrl: string };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** 조례 개정 반영 주기 — 7일마다 새로 받음 */
const STORE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memoryCache = new Map<string, { at: number; articles: LawArticle[] }>();

export async function loadLawArticles(source: LawSourceRef): Promise<LawArticle[]> {
  const key = source.kind === "law" ? `law:${source.id}` : `ordin:${source.mst}`;
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.articles;
  // 저장소 캐시 (7일) — 서버가 새로 떠도 법령정보센터를 다시 부르지 않아 빠르고, 센터 장애 시에도 동작
  const storeKey = `law-corpus/${key.replace(/[^\w-]/g, "_")}.json`;
  if (isR2Configured()) {
    const stored = await r2GetObject(storeKey).catch(() => null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored.toString("utf8")) as { at: number; articles: LawArticle[] };
        if (Date.now() - parsed.at < STORE_TTL_MS && parsed.articles.length > 0) {
          memoryCache.set(key, { at: Date.now(), articles: parsed.articles });
          return parsed.articles;
        }
      } catch {
        // 손상된 캐시는 무시하고 새로 조회
      }
    }
  }
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
  if (source.kind === "ordin") {
    // 조례 별표(심의기준표 등) — 본문 글자가 비어 있고 HWP 첨부로만 제공되므로 내려받아 글자를 읽음
    articles.push(...(await loadOrdinAttachments(result.data, source).catch(() => [])));
  }
  if (articles.length > 0) {
    if (memoryCache.size > 200) memoryCache.clear();
    memoryCache.set(key, { at: Date.now(), articles });
    if (isR2Configured()) {
      await r2PutObject(storeKey, Buffer.from(JSON.stringify({ at: Date.now(), articles }), "utf8"), "application/json").catch(() => undefined);
    }
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
    const article: LawArticle = { lawTitle, kind: "ordin", no, title: str(unit["조제목"]), text: body, sourceUrl: source.sourceUrl };
    articles.push(...splitLongArticle(article));
  }
  return articles;
}

/**
 * 여러 분야 기준을 한 조문에 담은 긴 조문(예: "심의기준은 공공건축물, 색채, 조명, 조경으로 구분…
 * 1. 공공건축물 … 2. 공공시설물 … 3. 색채 …")을 호 단위로 나눠, 항목별로 정확한 호를 인용하게 한다.
 */
export function splitLongArticle(article: LawArticle): LawArticle[] {
  if (article.text.length < 1500) return [article];
  const positions: Array<{ index: number; no: number }> = [];
  let expected = 1;
  const pattern = /(?:^|[\s.)>])(\d{1,2})\.\s*(?=[가-힣])/g;
  for (const match of article.text.matchAll(pattern)) {
    const no = Number(match[1]);
    if (no !== expected) continue;
    positions.push({ index: (match.index ?? 0) + match[0].indexOf(match[1]), no });
    expected += 1;
  }
  if (positions.length < 3) return [article];
  const preface = article.text.slice(0, positions[0].index).trim();
  return positions.map((position, index) => {
    const end = index + 1 < positions.length ? positions[index + 1].index : article.text.length;
    const body = article.text.slice(position.index, end).trim();
    const name = body.replace(/^\d{1,2}\.\s*/, "").split(/[\s:：(（가]/)[0].slice(0, 12) || `${position.no}호`;
    return {
      ...article,
      part: { no: String(position.no), name },
      text: `${preface.slice(0, 120)} … ${body}`,
    };
  });
}

/** 심의 기준과 무관한 절차·조직·벌칙 조문 (선정에서 제외) */
const PROCEDURAL_TITLE =
  /(목적|정의|시행일|벌칙|과태료|양벌|위임|위탁|수수료|청문|공무원 의제|다른 법률과의 관계|적용 범위|적용 제외|규제의 재검토|비밀|제척|회의|수당|운영세칙|간사|위원|협정|시상|디자인상|포상|사용승인|특별가로구역|특별건축구역|통합적용계획|산정|책무|기본방향|기본원칙|경관계획의|공청회|열람|공고|신청|절차|보고|비용|지원|교육|홍보|조사|자료|기록|이행|감독|취소|승계|준수|폐지|변경|재심의|사전협의|대상|협의체|조직|통지|제안|지정기준|기본계획|수립|구성)/;

/** 국가 법률은 심의 실무 기준 조문만 (그 외 조문은 너무 일반적) */
const NATIONAL_ALLOWED: Record<string, RegExp> = {
  건축법: /^(42|43|44|46|47|58|60|61)$/,
  경관법: /^(26|27|28)$/,
  "경관법 시행령": /^(18|19|20|21|22)$/,
};

function isUsable(article: LawArticle): boolean {
  if (PROCEDURAL_TITLE.test(article.title)) return false;
  if (article.kind === "law") {
    const allowed = NATIONAL_ALLOWED[article.lawTitle.trim()];
    if (allowed && !allowed.test(article.no)) return false;
  }
  return true;
}

/** 심의 기준을 직접 정한 조문인가 (본문이 길어도 더 많이 전달) */
export function isStandardArticle(article: Pick<LawArticle, "title">): boolean {
  return /(심의기준|심의 기준|기준|가이드라인|색채|조명|조경|옥외광고|높이|건축선)/.test(article.title);
}

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
  if (!isUsable(article)) return 0;
  let score = 0;
  const heading = article.part ? `${article.title} ${article.part.name}` : article.title;
  for (const token of tokens) {
    if (article.part && article.part.name.includes(token)) score += 6;
    else if (heading.includes(token)) score += 4;
    else if (article.text.includes(token)) score += 1;
  }
  if (score === 0) return 0;
  // 조례는 지역 실무 기준이라 가중, 심의 기준 조문은 더 가중
  if (article.kind === "ordin") score += 1;
  if (/(심의기준|심의 기준|가이드라인)/.test(article.title)) score += 4;
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

export function articleKey(article: Pick<LawArticle, "lawTitle" | "no" | "part">): string {
  return `${article.lawTitle}#${article.no}${article.part ? `-${article.part.no}` : ""}`;
}

export function articleLabel(article: Pick<LawArticle, "no" | "title" | "part">): string {
  if (article.no.startsWith("별표")) {
    const head = `[별표 ${article.no.slice(2)}] ${article.title}`;
    return article.part ? `${head} (${article.part.name})` : head;
  }
  if (article.part) return `제${article.no}조제${article.part.no}호(${article.part.name})`;
  return article.title ? `제${article.no}조(${article.title})` : `제${article.no}조`;
}


type AttachmentRow = { title: string; fileUrl: string; kind: string; no: string; text: string };

/** 심의 기준을 담은 별표만 (신청서·서식·심의 대상 목록 제외) */
const USEFUL_ATTACHMENT = /(기준|가이드|지침|색채|조명|조경|옥외광고|디자인|경관관리)/;
const SKIP_ATTACHMENT = /(서식|신청|대상|위원|수당|수수료|과태료)/;

export async function loadOrdinAttachments(payload: Record<string, unknown>, source: { title: string; sourceUrl: string }): Promise<LawArticle[]> {
  const service = (payload.LawService ?? {}) as Record<string, unknown>;
  const lawTitle = str((service["자치법규기본정보"] as Record<string, unknown> | undefined)?.["자치법규명"]) || source.title;
  const rows: AttachmentRow[] = asArray<Record<string, unknown>>((service["별표"] as Record<string, unknown> | undefined)?.["별표단위"]).map((row) => ({
    title: str(row["별표제목"]),
    fileUrl: str(row["별표첨부파일명"]),
    kind: str(row["별표첨부파일구분"]).toLowerCase(),
    no: String(Number(str(row["별표번호"])) || ""),
    text: clean(str(row["별표내용"])),
  }));
  const wanted = rows
    .filter((row) => /^\[별표/.test(row.title) && USEFUL_ATTACHMENT.test(row.title) && !SKIP_ATTACHMENT.test(row.title))
    .slice(0, 8);
  const loaded = await Promise.all(
    wanted.map(async (row) => {
      const text = row.text || (await fetchAttachmentText(row).catch(() => ""));
      if (!text) return [] as LawArticle[];
      const name = row.title.replace(/^\[별표\s*\d+[^\]]*\]\s*/, "").trim() || row.title;
      const base: LawArticle = { lawTitle, kind: "ordin", no: `별표${row.no}`, title: name, text, sourceUrl: source.sourceUrl };
      return chunkAttachment(base);
    }),
  );
  return loaded.flat();
}

/** 긴 별표는 약 1,500자 단위로 나눠 항목마다 관련 부분만 전달 */
function chunkAttachment(article: LawArticle): LawArticle[] {
  const size = 1500;
  if (article.text.length <= 2500) return [article];
  const pieces: string[] = [];
  let rest = article.text;
  while (rest.length > 0) {
    if (rest.length <= size * 1.3) {
      pieces.push(rest);
      break;
    }
    const cut = Math.max(rest.lastIndexOf(" ", size), Math.floor(size * 0.7));
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return pieces.map((text, index) => ({ ...article, part: { no: String(index + 1), name: `${index + 1}/${pieces.length}` }, text }));
}

async function fetchAttachmentText(row: AttachmentRow): Promise<string> {
  if (row.kind && !["hwp", "hwpx"].includes(row.kind)) return "";
  let url: URL;
  try {
    url = new URL(row.fileUrl.replace(/^http:/, "https:"));
  } catch {
    return "";
  }
  // 국가법령정보센터 첨부만 내려받음
  if (!/(^|\.)law\.go\.kr$/.test(url.hostname)) return "";
  const cacheKey = `law-attachments/${url.searchParams.get("flSeq") ?? encodeURIComponent(row.title)}.txt`;
  if (isR2Configured()) {
    const cached = await r2GetObject(cacheKey).catch(() => null);
    if (cached) return replaceHwpBullets(cached.toString("utf8"));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "G-MADE-HIVE/1.0" } });
  if (!response.ok) return "";
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return "";
  let text = "";
  try {
    text = extractHwpText(buffer).slice(0, 40_000);
  } catch (error) {
    console.warn(`[law-corpus] 별표 글자 추출 실패 (${row.title}):`, error instanceof Error ? error.message : error);
    return "";
  }
  if (text && isR2Configured()) await r2PutObject(cacheKey, Buffer.from(text, "utf8"), "text/plain; charset=utf-8").catch(() => undefined);
  return text;
}
