import type { EvaluationContext } from "../evaluation-context";
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

const DOCUMENT_DRAWING_PATTERNS = [
  /배치도/g,
  /입면도/g,
  /단면도/g,
  /조감도/g,
  /투시도/g,
  /색채계획/g,
  /야간경관/g,
  /보행동선/g,
  /사업계획서/g,
  /건축개요/g,
] as const;

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

const GENERIC_OPENING_PATTERNS = [
  /^심사위원 검토/,
  /^보완 여부를 확인/,
  /^현장 맥락과 보완 조건/,
  /^개선권고사항$/,
  /^추가 설명자료가 필요/,
  /^세부 재료와 유지관리 기준을 명확히/,
] as const;

const VAGUE_BODY_PATTERNS = [
  /구체적인?\s*.+미흡/,
  /핵심적인?\s*.+미흡/,
  /.+방안.+(?:미흡|부족)/,
  /계획이?\s*(?:미흡|부족)/,
  /보완이?\s*필요(?:합니다)?\.?$/,
  /추가(?:적인)?\s*검토/,
  /접근성.*안전성.*(?:미흡|부족|보완)/,
  /안전성.*접근성.*(?:미흡|부족|보완)/,
  /확보\s*방안.*(?:미흡|부족)/,
  /미흡하여\s*보완/,
  /보완이?\s*필요하여/,
] as const;

const DOCUMENT_ANCHOR_PATTERN =
  /도면|배치|입면|조감|단면|사업계획|건축개요|제출\s*자료|페이지|옥외|옥상|\d+층|㎡|m²|\d+\s*m(?:²)?/i;

const ACTION_ANCHOR_PATTERN =
  /난간|계단|미끄럼|차양|조도|눈부심|식재|마감|동선|경사|손잡이|휘도|색채|재료|보행|경사|휴게|교차|주차|출입|엘리베이터|승강기/i;

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

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractEvidenceSnippet(corpus: string, keywords: string[], radius = 90): string {
  const lowerCorpus = corpus.toLowerCase();

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) continue;

    const idx = lowerCorpus.indexOf(trimmed.toLowerCase());
    if (idx < 0) continue;

    const start = Math.max(0, idx - radius);
    const end = Math.min(corpus.length, idx + trimmed.length + radius);
    const snippet = normalizeSnippet(corpus.slice(start, end));
    if (snippet.length >= 12) {
      return snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet;
    }
  }

  return "";
}

function findRelevantFile(files: UploadedFileSummary[], item: EvaluationItem): UploadedFileSummary | undefined {
  const keywords = [item.detailItem, item.middleCategory, item.majorCategory]
    .map((value) => value.trim())
    .filter(Boolean);

  for (const file of files) {
    const corpus = file.extractedTextPreview ?? "";
    if (!corpus.trim()) continue;
    if (keywords.some((keyword) => corpus.toLowerCase().includes(keyword.toLowerCase()))) {
      return file;
    }
  }

  return files.find((file) => (file.extractedTextPreview ?? "").trim().length > 0);
}

function inferDrawingLabel(corpus: string, item: EvaluationItem): string {
  const drawingHits = collectMatches(corpus, DOCUMENT_DRAWING_PATTERNS);
  if (drawingHits.length > 0) return drawingHits[0];

  if (/보행|동선|접근/.test(item.detailItem + item.middleCategory)) return "배치도·보행동선도";
  if (/야간|조명/.test(item.detailItem + item.middleCategory)) return "야간경관 계획";
  if (/색채|마감/.test(item.detailItem + item.middleCategory)) return "입면도·색채계획";
  if (/녹지|조경/.test(item.detailItem + item.middleCategory)) return "조경계획";
  return "제출 도면·계획서";
}

/** 문장에 자료 근거(위치·도면·수치·조치)가 실제로 포함됐는지 검사합니다. */
export function hasConcreteEvidence(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 24) return false;

  const hasDocumentAnchor = DOCUMENT_ANCHOR_PATTERN.test(normalized);
  const hasActionAnchor = ACTION_ANCHOR_PATTERN.test(normalized);
  const hasQuotedSource = /「.+」/.test(normalized);
  const hasNumericDetail = /\d/.test(normalized);

  return hasDocumentAnchor && (hasActionAnchor || hasQuotedSource || hasNumericDetail);
}

export function isGenericRecommendation(text: string | undefined): boolean {
  if (!text?.trim()) return true;

  const normalized = text.trim();
  if (GENERIC_OPENING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (VAGUE_BODY_PATTERNS.some((pattern) => pattern.test(normalized)) && !hasConcreteEvidence(normalized)) {
    return true;
  }

  return !hasConcreteEvidence(normalized);
}

export function isGenericRationale(text: string | undefined): boolean {
  if (!text?.trim()) return true;

  const normalized = text.trim();
  if (normalized === "심사위원 검토가 필요합니다.") return true;
  if (VAGUE_BODY_PATTERNS.some((pattern) => pattern.test(normalized)) && !hasConcreteEvidence(normalized)) {
    return true;
  }

  const onlyCriteriaRepeat =
    normalized.length < 80 && !DOCUMENT_ANCHOR_PATTERN.test(normalized) && !/\d/.test(normalized);
  return onlyCriteriaRepeat;
}

/** AI 응답이 비었거나 일반 문구일 때, 추출 본문에서 공간·이용자·보완 조치를 끌어내 평가의견형 권고를 만듭니다. */
export function buildFallbackRecommendation(
  item: EvaluationItem,
  files: UploadedFileSummary[],
  score: number,
): string {
  const corpus = files.map((file) => file.extractedTextPreview ?? "").join("\n");
  const relevantFile = findRelevantFile(files, item);
  const sourceLabel = relevantFile ? `「${relevantFile.originalName}」` : "제출 자료";
  const drawingLabel = inferDrawingLabel(corpus, item);
  const evidenceSnippet = extractEvidenceSnippet(corpus, [
    item.detailItem,
    item.middleCategory,
    item.majorCategory,
    ...collectMatches(corpus, SPACE_PATTERNS),
    ...collectMatches(corpus, DOCUMENT_DRAWING_PATTERNS),
  ]);
  const spaces = collectMatches(corpus, SPACE_PATTERNS);
  const users = collectMatches(corpus, USER_PATTERNS);
  const topicKey = inferTopicKey(item);
  const measures = MEASURE_BY_TOPIC[topicKey] ?? MEASURE_BY_TOPIC.document;

  const spacePhrase = spaces[0] ?? item.middleCategory;
  const userPhrase = users.includes("고령 이용자") || users.includes("고령")
    ? "고령 이용자"
    : users[0] ?? "이용자";
  const measurePhrase = joinPhrases(measures.slice(0, 4));

  const evidenceLead = evidenceSnippet
    ? `${sourceLabel} ${drawingLabel} 및 본문에서 "${evidenceSnippet}" 등이 확인되나,`
    : `${sourceLabel} ${drawingLabel} 기준 ${item.detailItem} 관련 내용을 검토한 결과,`;

  if (corpus.trim().length > 120 && (spaces.length > 0 || users.length > 0 || score < 85)) {
    const purpose =
      topicKey === "public" || topicKey === "walk"
        ? `${userPhrase}의 휴게·교류·이동`
        : `${item.detailItem} 계획`;

    return `${evidenceLead} ${spacePhrase}의 ${purpose} 측면에서 ${measurePhrase} 등 세부 기준이 제시되지 않았습니다. 해당 위치·동선을 도면에 표기하고 ${measurePhrase} 등을 실시설계 단계에서 구체화 하시기 바랍니다.`;
  }

  if (corpus.trim().length > 80) {
    return `${evidenceLead} ${spacePhrase} 및 ${item.detailItem}에 대한 계획은 확인되나 ${measurePhrase} 등 시공·유지관리 기준이 부족합니다. 관련 도면·계획서에 수치·재료·시공 상세를 보완 하시기 바랍니다.`;
  }

  return `${sourceLabel}에서 ${item.detailItem}과 관련된 공간·동선·마감 계획을 확인한 뒤, ${measurePhrase} 등 보완 조치를 도면과 계획서에 명시하시기 바랍니다.`;
}

export function buildFallbackRationale(
  item: EvaluationItem,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): string {
  const corpus = files.map((file) => file.extractedTextPreview ?? "").join("\n");
  const relevantFile = findRelevantFile(files, item);
  const sourceLabel = relevantFile ? `「${relevantFile.originalName}」` : "제출 자료";
  const drawingLabel = inferDrawingLabel(corpus, item);
  const evidenceSnippet = extractEvidenceSnippet(corpus, [
    item.detailItem,
    item.middleCategory,
    item.majorCategory,
    ...collectMatches(corpus, SPACE_PATTERNS),
  ]);
  const parts: string[] = [];

  if (evidenceSnippet) {
    parts.push(
      `${sourceLabel} ${drawingLabel}에서 "${evidenceSnippet}" 등을 확인함. ${item.detailItem}은 이 내용을 기준으로 검토함.`,
    );
  } else {
    parts.push(`${sourceLabel} ${drawingLabel} 및 ${item.detailItem} 관련 기재를 검토함.`);
  }

  parts.push(`평가기준: ${item.criteria}`);

  const lawRef = evaluationContext.referenceLaws[0];
  if (lawRef) {
    parts.push(`참고 법령: ${lawRef.title} ${lawRef.article}.`);
  }

  const spatial = evaluationContext.spatial;
  if (spatial?.matchedZones[0]) {
    parts.push(`인근 경관지구: ${spatial.matchedZones[0].name}.`);
  } else if (spatial) {
    parts.push("경관지구 조회 반경 내 해당 레이어는 확인되지 않음.");
  }

  return parts.join(" ");
}
