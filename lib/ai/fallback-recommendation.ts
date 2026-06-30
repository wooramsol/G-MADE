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

const ISSUE_FOCUS_MARKERS =
  /미흡|누락|보완|검토|불명확|미기재|모순|부족|제시되지|확인(?:되지|불가)|재확인|재검토|수정|구체화|명시|추가\s*(?:제출|확인)|기재(?:되지|없)|표기(?:되지|없)|상호\s*검토|리스크|쟁점/i;

const PRAISE_MARKERS =
  /잘\s*(?:반영|구현|계획|마련)|우수(?:합니다|함|하)?|적절(?:합니다|함|하)?|충분(?:합니다|함|하)?|양호|훌륭|긍정적|만족|잘\s*되어|원활(?:합니다|함)?|우수한|적합(?:합니다|함)?/i;

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

function inferDrawingLabel(corpus: string): string {
  const drawingHits = collectMatches(corpus, DOCUMENT_DRAWING_PATTERNS);
  if (drawingHits.length > 0) return drawingHits[0];
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

/** 칭찬·긍정 위주이고 검토·보완 이슈가 없으면 true */
export function lacksIssueFocus(text: string | undefined): boolean {
  if (!text?.trim()) return true;

  const normalized = text.trim();
  const hasIssue = ISSUE_FOCUS_MARKERS.test(normalized);
  const hasPraise = PRAISE_MARKERS.test(normalized);

  if (hasPraise && !hasIssue) return true;
  if (normalized.length >= 48 && !hasIssue) return true;

  return false;
}

export function isGenericRecommendation(text: string | undefined): boolean {
  if (!text?.trim()) return true;
  if (lacksIssueFocus(text)) return true;

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
  if (lacksIssueFocus(text)) return true;

  const normalized = text.trim();
  if (normalized === "심사위원 검토가 필요합니다.") return true;
  if (VAGUE_BODY_PATTERNS.some((pattern) => pattern.test(normalized)) && !hasConcreteEvidence(normalized)) {
    return true;
  }

  const onlyCriteriaRepeat =
    normalized.length < 80 && !DOCUMENT_ANCHOR_PATTERN.test(normalized) && !/\d/.test(normalized);
  return onlyCriteriaRepeat;
}

function formatNumberedIssues(issues: string[]): string {
  return issues.map((issue, index) => `${["①", "②", "③", "④", "⑤"][index] ?? `${index + 1}.`} ${issue}`).join(" ");
}

/** AI 응답이 비었거나 일반·칭찬 위주일 때, 추출 본문에서 검토·보완 필요 사항을 끌어내 평가의견을 만듭니다. */
export function buildFallbackRecommendation(
  item: EvaluationItem,
  files: UploadedFileSummary[],
  score: number,
): string {
  const corpus = files.map((file) => file.extractedTextPreview ?? "").join("\n");
  const relevantFile = findRelevantFile(files, item);
  const sourceLabel = relevantFile ? `「${relevantFile.originalName}」` : "제출 자료";
  const drawingLabel = inferDrawingLabel(corpus);
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

  const spacePhrase = spaces[0] ?? `${item.detailItem} 관련 공간`;
  const userPhrase = users.includes("고령 이용자") || users.includes("고령")
    ? "고령 이용자"
    : users[0] ?? "이용자";
  const measureList = measures.slice(0, 4);

  const evidenceLead = evidenceSnippet
    ? `${sourceLabel} ${drawingLabel} 및 본문 "${evidenceSnippet}" 등을 검토한 결과,`
    : `${sourceLabel} ${drawingLabel} 및 ${item.detailItem} 관련 제출 자료를 검토한 결과,`;

  const reviewIssues: string[] = [
    `${spacePhrase}에 대한 ${measureList[0] ?? "시공·안전 기준"}이 도면·계획서에 수치·재료·시공 상세로 제시되지 않음`,
    `${measureList[1] ?? "동선·접근"} 관련 배치·표기가 도면에서 확인되지 않거나 불명확함`,
    `${measureList[2] ?? "유지관리·관리 계획"} 기준이 계획서 본문·도면 어디에도 명시되지 않음`,
  ];

  if (users.length > 0 || topicKey === "public" || topicKey === "walk") {
    reviewIssues.push(
      `${userPhrase}의 휴게·이동·교류 동선과 시설 배치가 ${drawingLabel}에서 상호 검토 가능하도록 연계 표기되지 않음`,
    );
  }

  if (score >= 85) {
    reviewIssues.push(
      `점수는 높으나 ${item.detailItem} 평가기준(${item.criteria}) 대비 실시설계 단계에서 재확인할 세부 항목이 남아 있음`,
    );
  }

  if (!corpus.trim() || corpus.trim().length < 80) {
    reviewIssues.push("제출 자료 본문·도면에서 해당 항목을 뒷받침할 구체 기재·수치가 부족하여 추가 설명·도면 보완이 필요함");
  }

  const numbered = formatNumberedIssues(reviewIssues.slice(0, 5));
  const measurePhrase = joinPhrases(measureList);

  return `${evidenceLead} ${spacePhrase} 관련하여 다음 사항의 수정·보완·재확인이 필요합니다. ${numbered}. 관련 도면·계획서에 위치·동선을 표기하고 ${measurePhrase} 등을 수치·재료·시공 상세와 함께 실시설계 단계에서 구체화·재검토 하시기 바랍니다.`;
}

export function buildFallbackRationale(
  item: EvaluationItem,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): string {
  const corpus = files.map((file) => file.extractedTextPreview ?? "").join("\n");
  const relevantFile = findRelevantFile(files, item);
  const sourceLabel = relevantFile ? `「${relevantFile.originalName}」` : "제출 자료";
  const drawingLabel = inferDrawingLabel(corpus);
  const evidenceSnippet = extractEvidenceSnippet(corpus, [
    item.detailItem,
    item.middleCategory,
    item.majorCategory,
    ...collectMatches(corpus, SPACE_PATTERNS),
  ]);
  const topicKey = inferTopicKey(item);
  const measures = MEASURE_BY_TOPIC[topicKey] ?? MEASURE_BY_TOPIC.document;
  const parts: string[] = [];

  if (evidenceSnippet) {
    parts.push(`${sourceLabel} ${drawingLabel}에서 "${evidenceSnippet}" 등 관련 기재는 있으나,`);
  } else {
    parts.push(`${sourceLabel} ${drawingLabel} 및 ${item.detailItem} 관련 기재를 검토한 결과,`);
  }

  const gapIssues = [
    `평가기준「${item.criteria}」대비 ${measures[0]} 등 세부 수치·재료·시공 기준이 도면·계획서에 명시되지 않음`,
    `${measures[1] ?? "동선·공간 관계"}가 도면·본문에서 상호 연계되어 확인되지 않음`,
    `${measures[2] ?? "유지관리·관리 계획"}이 누락되었거나 불명확하여 심사위원 재검토 필요`,
  ];

  parts.push(`다음 검토·보완 필요 사항이 확인됨: ${formatNumberedIssues(gapIssues)}.`);

  const lawRef = evaluationContext.referenceLaws[0];
  if (lawRef) {
    parts.push(`${lawRef.title} ${lawRef.article} 관련 세부 적용 여부도 추가 확인 필요.`);
  }

  const spatial = evaluationContext.spatial;
  if (spatial?.matchedZones[0]) {
    parts.push(`인근 경관지구(${spatial.matchedZones[0].name}) 맥락과의 정합성도 재검토 필요.`);
  }

  return parts.join(" ");
}
