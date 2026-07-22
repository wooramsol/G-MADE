import manualPages from "./manual-pages.json";

/**
 * 서울시 경관심의 통합 매뉴얼 (조례반영판) — 페이지별 추출 텍스트.
 * 모든 검토에서 체크리스트 항목과 관련된 페이지를 발췌해 평가 컨텍스트로 주입합니다.
 * 원본: 경관심의_통합_매뉴얼_단면_26.01.20_조례반영.pdf (215p)
 */
export const MANUAL_TITLE = "서울시 경관심의 통합 매뉴얼 (조례반영, 2026.01)";

type ManualPage = { page: number; text: string };

const PAGES: ManualPage[] = manualPages as ManualPage[];

/** 발췌 상한 — 컨텍스트 토큰 예산 내 유지 */
const MAX_EXCERPT_PAGES = 10;
const MAX_TOTAL_CHARS = 7_000;

const STOPWORDS = new Set([
  "있는", "있도록", "위한", "위하여", "대한", "관련", "등의", "등을", "등이", "하는", "되는",
  "경우", "사항", "여부", "검토", "계획", "확인", "반영", "고려", "필요", "적용", "작성",
]);

function tokenize(text: string): string[] {
  const matches = text.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [];
  return matches.map((token) => token.toLowerCase()).filter((token) => !STOPWORDS.has(token));
}

const PAGE_TOKENS: Array<Set<string>> = PAGES.map((entry) => new Set(tokenize(entry.text)));

/** 토큰 희소성 가중치: 매뉴얼 전반에 흔한 토큰일수록 낮은 점수 */
const DOCUMENT_FREQUENCY = new Map<string, number>();
for (const tokens of PAGE_TOKENS) {
  for (const token of tokens) {
    DOCUMENT_FREQUENCY.set(token, (DOCUMENT_FREQUENCY.get(token) ?? 0) + 1);
  }
}

function tokenWeight(token: string): number {
  const df = DOCUMENT_FREQUENCY.get(token) ?? 0;
  if (df === 0) return 0;
  return 1 / Math.log2(2 + df);
}

/**
 * 질의(체크리스트 항목 원문들)와 관련성이 높은 매뉴얼 페이지를 선별합니다.
 * 희소 토큰 가중 합산 방식 — 정밀 검색이 아닌 근거 후보 발췌 용도입니다.
 */
export function selectManualExcerpts(queries: string[], maxPages = MAX_EXCERPT_PAGES): ManualPage[] {
  const queryTokens = new Set<string>();
  for (const query of queries) {
    for (const token of tokenize(query)) queryTokens.add(token);
  }
  if (queryTokens.size === 0) return [];

  const scored = PAGES.map((entry, index) => {
    let score = 0;
    for (const token of queryTokens) {
      if (PAGE_TOKENS[index].has(token)) score += tokenWeight(token);
    }
    return { entry, score };
  })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const selected: ManualPage[] = [];
  let used = 0;
  for (const { entry } of scored) {
    if (selected.length >= maxPages) break;
    if (used + entry.text.length > MAX_TOTAL_CHARS) continue;
    selected.push(entry);
    used += entry.text.length;
  }

  return selected.sort((left, right) => left.page - right.page);
}

/** 평가 프롬프트에 넣을 매뉴얼 발췌 블록을 만듭니다. 관련 페이지가 없으면 빈 문자열. */
export function buildManualContextText(queries: string[]): string {
  const excerpts = selectManualExcerpts(queries);
  if (excerpts.length === 0) return "";

  return `[심의 매뉴얼 발췌 — ${MANUAL_TITLE}]\n${excerpts
    .map((entry) => `(매뉴얼 p.${entry.page}) ${entry.text}`)
    .join("\n")}`;
}
