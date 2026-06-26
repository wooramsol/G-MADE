import type { EvaluationItem } from "../types";
import type { UploadedFileSummary } from "./analysis-types";

const SPACE_PATTERNS = [
  /(?:\d+층\s*)?옥외(?:\s*공간)?/g,
  /(?:\d+층\s*)?옥상(?:\s*정원|\s*테라스)?/g,
  /\d+층\s*(?:휴게|교류|체류|공용|공개)\s*공간/g,
  /증축(?:\s*부분|\s*동)?/g,
  /(?:옥외|야외)\s*휴게(?:\s*공간)?/g,
  /공개공지/g,
  /(?:중정|마당|데크|발코니)/g,
] as const;

const USER_PATTERNS = [/고령\s*(?:이용자|층|복지|시설)?/g, /어르신/g, /보행약자/g, /장애인/g, /이용자/g] as const;

const MEASURE_BY_TOPIC: Record<string, string[]> = {
  walk: ["계단 단 높이·경사 조정", "미끄럼 방지 바닥재", "차양·그늘(계단에서 출입구 이동 구간)", "손잡이·안내표지"],
  public: ["난간 높이", "바닥 미끄럼 방지", "차양·그늘", "휴게·교류 가구 배치", "이동 동선 분리"],
  green: ["식재 수종·관리 기준", "관수·배수 계획", "계절별 유지관리"],
  nightscape: ["조도·휘도 기준", "눈부심 저감", "야간 보행 안전 조명"],
  facade: ["입면 재료·마감 상세", "저층부 개방감", "장대 입면 분절"],
  color: ["주조색·강조색 팔레트", "반사율·질감 시공 기준"],
  urban: ["매스 분절", "스카이라인 연속성", "주변 건축물과의 스케일 조정"],
  document: ["누락 도면·계획서 보완", "실시설계 단계 상세도면", "시공 상세 및 유지관리 계획"],
};

function collectMatches(text: string, patterns: readonly RegExp[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      if (value.length >= 2) {
        found.add(value);
      }
    }
  }
  return [...found];
}

function inferTopicKey(item: EvaluationItem): keyof typeof MEASURE_BY_TOPIC {
  const id = item.id;
  if (id.includes("walk")) return "walk";
  if (id.includes("public")) return "public";
  if (id.includes("green")) return "green";
  if (id.includes("night")) return "nightscape";
  if (id.includes("facade")) return "facade";
  if (id.includes("color")) return "color";
  if (id.includes("urban") || id.includes("scale")) return "urban";
  return "document";
}

function joinPhrases(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} 및 ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${items.at(-1)}`;
}

/** AI 응답이 비었거나 일반 문구일 때, 추출 본문에서 공간·이용자·보완 조치를 끌어내 평가의견형 권고를 만듭니다. */
export function buildFallbackRecommendation(
  item: EvaluationItem,
  files: UploadedFileSummary[],
  score: number,
): string {
  const corpus = files.map((file) => file.extractedTextPreview ?? "").join("\n");
  const spaces = collectMatches(corpus, SPACE_PATTERNS);
  const users = collectMatches(corpus, USER_PATTERNS);
  const topicKey = inferTopicKey(item);
  const measures = MEASURE_BY_TOPIC[topicKey] ?? MEASURE_BY_TOPIC.document;

  const spacePhrase = spaces[0] ?? item.middleCategory;
  const userPhrase = users.includes("고령 이용자") || users.includes("고령")
    ? "고령 이용자"
    : users[0] ?? "이용자";
  const measurePhrase = joinPhrases(measures.slice(0, 4));

  if (corpus.trim().length > 120 && (spaces.length > 0 || users.length > 0 || score < 85)) {
    const purpose =
      topicKey === "public" || topicKey === "walk"
        ? `${userPhrase}의 휴게·교류·이동 공간`
        : `${item.detailItem} 관련 계획`;

    return `본 사업으로 가능하다면 ${spacePhrase}이(가) ${purpose}으로 안정적으로 활용될 수 있도록, ${measurePhrase} 등 안전·쾌적성 확보 방안을 실시설계 단계에서 보다 구체화 하시기 바랍니다.`;
  }

  if (corpus.trim().length > 80) {
    return `제출 자료상 ${spacePhrase} 및 ${item.detailItem}에 대한 계획이 확인되나, ${measurePhrase} 등 세부 시공·유지관리 기준을 실시설계 단계에서 보완·구체화 하시기 바랍니다.`;
  }

  return `제출 자료에서 ${item.detailItem}과 관련된 공간·동선·마감 계획을 확인한 뒤, ${measurePhrase} 등 보완 조치를 실시설계 단계에서 구체화 하시기 바랍니다.`;
}

export function isGenericRecommendation(text: string | undefined): boolean {
  if (!text?.trim()) return true;
  const normalized = text.trim();
  const genericPatterns = [
    /^심사위원 검토/,
    /^보완 여부를 확인/,
    /^현장 맥락과 보완 조건/,
    /^개선권고사항$/,
    /^추가 설명자료가 필요/,
    /^세부 재료와 유지관리 기준을 명확히/,
  ];
  return genericPatterns.some((pattern) => pattern.test(normalized));
}
