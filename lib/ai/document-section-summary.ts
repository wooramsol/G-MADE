import type { EvaluationContext } from "../evaluation-context";
import { collectUniqueRoundFiles } from "../evaluation-round-files";
import type { EvaluationRound } from "../types";
import {
  hasBrokenHangulLead,
  normalizeDocumentText,
  sanitizeBrokenHangulQuotes,
  sliceGraphemeRange,
  truncateGraphemes,
} from "../document-text-utils";
import type { UploadedFileSummary } from "./analysis-types";
import { buildAnalysisCorpus, checkEvaluationTextGrounding } from "./grounding-guard";
import { lacksIssueFocus } from "./fallback-recommendation";

const GENERIC_SECTION_BOILERPLATE =
  /제출\s*자료\s*전반에서\s*심사위원이\s*우선\s*재확인|항목별\s*검토·보완\s*의견을\s*확인하세요|AI가\s*해당\s*자료를\s*분석했습니다/;

const SECTION_KEYWORDS: Record<string, string[]> = {
  건축개요: ["건축개요", "연면적", "층수", "용도", "규모", "구조"],
  배치도: ["배치", "배치도", "주차", "진입", "동선"],
  입면도: ["입면", "입면도", "마감", "재료", "개구부"],
  조감도: ["조감", "조감도", "투시", "매스", "스카이라인"],
  색채계획: ["색채", "주조색", "강조색", "마감재", "반사"],
  야간경관: ["야간", "조명", "휘도", "눈부심", "조도"],
  보행동선: ["보행", "동선", "접근", "계단", "경사", "난간"],
  녹지계획: ["녹지", "조경", "식재", "수목", "관수"],
  공공공간: ["공공", "휴게", "옥외", "옥상", "공개공지", "체류"],
  주변현황: ["주변", "현황", "인접", "경관", "조망"],
};

const SECTION_REVIEW_GAPS: Record<string, string[]> = {
  건축개요: ["층수·연면적·용도", "주요 구조·마감 개요", "증축·리모델링 범위"],
  배치도: ["보행·차량 동선", "공개공지·조경과의 관계", "장애인·보행약자 접근"],
  입면도: ["입면 재료·색채 상세", "저층부·상층부 차별", "창호·개구부 계획"],
  조감도: ["주변 건축물과의 스케일", "매스 분절·조망 관계", "옥상·외부 공간 표현"],
  색채계획: ["주조색·강조색 팔레트", "재료 질감·반사율", "주변 색채와의 조화"],
  야간경관: ["조도·휘도 기준", "눈부심·빛공해 저감", "보행 안전 조명"],
  보행동선: ["주출입·보행 연결", "계단·경사·엘리베이터 연계", "난간·미끄럼 방지"],
  녹지계획: ["식재 수종·배치", "관수·배수·유지관리", "기존 수목 보전"],
  공공공간: ["휴게·체류 가구", "이용자 유형·동선", "차양·쾌적성"],
  주변현황: ["인접 건축물·도로", "경관지구·조망", "소음·일조 영향"],
};

function extractSectionSnippet(corpus: string, keywords: string[]): string {
  const normalizedCorpus = corpus.normalize("NFC");
  const lowerCorpus = normalizedCorpus.toLowerCase();

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) continue;

    const idx = lowerCorpus.indexOf(trimmed.toLowerCase());
    if (idx < 0) continue;

    const start = Math.max(0, idx - 70);
    const end = Math.min(normalizedCorpus.length, idx + trimmed.length + 90);
    const snippet = sanitizeBrokenHangulQuotes(
      normalizeDocumentText(sliceGraphemeRange(normalizedCorpus, start, end)),
    );
    if (snippet.length >= 10 && !hasBrokenHangulLead(snippet)) {
      const clipped = truncateGraphemes(snippet, 140);
      return clipped.length < snippet.length ? `${clipped}…` : clipped;
    }
  }

  return "";
}

function findRelevantFile(files: UploadedFileSummary[], keywords: string[]): UploadedFileSummary | undefined {
  for (const file of files) {
    const corpus = file.extractedTextPreview ?? "";
    if (!corpus.trim()) continue;
    if (keywords.some((keyword) => corpus.toLowerCase().includes(keyword.toLowerCase()))) {
      return file;
    }
  }

  return files.find((file) => (file.extractedTextPreview ?? "").trim().length > 0);
}

function mentionsSectionLabel(text: string, label: string): boolean {
  const keywords = SECTION_KEYWORDS[label] ?? [label];
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.replace(/\s+/g, "").toLowerCase()));
}

function isGenericSectionSummary(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  if (GENERIC_SECTION_BOILERPLATE.test(normalized)) return true;
  return normalized.length < 28;
}

export function buildFallbackDocumentSectionSummary(
  label: string,
  files: UploadedFileSummary[],
): string {
  const corpus = buildAnalysisCorpus(files);
  const keywords = SECTION_KEYWORDS[label] ?? [label];
  const gaps = SECTION_REVIEW_GAPS[label] ?? [`${label} 관련 세부 계획`, "수치·재료·시공 상세"];
  const relevantFile = findRelevantFile(files, keywords);
  const sourceLabel = relevantFile ? `「${relevantFile.originalName}」` : "제출 자료";
  const snippet = extractSectionSnippet(corpus, keywords);

  if (snippet && !hasBrokenHangulLead(snippet)) {
    return [
      `${sourceLabel}에서 ${label} 관련 "${snippet}" 등을 확인함.`,
      `다만 ${gaps[0]}, ${gaps[1]} 등이 도면·본문에 미기재·불명확하여 심사위원 재확인 필요.`,
      gaps[2] ? `추가로 ${gaps[2]}도 실시설계 단계에서 보완 검토 필요.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (corpus.trim().length > 60) {
    return [
      `${sourceLabel}에서 ${label}에 직접 대응하는 도면·본문 기재가 부족함.`,
      `${gaps[0]}, ${gaps[1]} 등 ${label} 항목별 검토·보완이 필요함.`,
      gaps[2] ? `${gaps[2]} 관련 자료·수치 제출을 검토하시기 바랍니다.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `${label} 관련 제출 자료가 확인되지 않거나 텍스트 추출이 제한됨.`,
    `${gaps[0]}, ${gaps[1]} 등이 포함된 ${label}·관련 도면·계획서 보완 제출이 필요함.`,
  ].join("\n");
}

export function sanitizeDocumentSectionSummary(
  label: string,
  rawSummary: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): { text: string; warning?: string } {
  const text = rawSummary.trim();

  if (!isGenericSectionSummary(text) && !lacksIssueFocus(text) && mentionsSectionLabel(text, label)) {
    const grounding = checkEvaluationTextGrounding(text, files, evaluationContext);
    if (grounding.grounded) {
      return { text: sanitizeBrokenHangulQuotes(text) };
    }
  }

  if (
    !isGenericSectionSummary(text) &&
    !lacksIssueFocus(text) &&
    text.length >= 48 &&
    mentionsSectionLabel(text, label)
  ) {
    return { text: sanitizeBrokenHangulQuotes(text) };
  }

  const fallback = sanitizeBrokenHangulQuotes(buildFallbackDocumentSectionSummary(label, files));
  const warning =
    text && text !== fallback
      ? `${label} 요약: 항목별 고유 내용이 부족해 도면·본문 기반 요약으로 보정했습니다.`
      : undefined;

  return { text: fallback, warning };
}

function buildFileSummariesFromRound(round: EvaluationRound): UploadedFileSummary[] {
  const corpus = [
    round.aiAnalysis.summary,
    ...round.aiAnalysis.documentSections.map((section) => `${section.label}: ${section.summary}`),
  ]
    .filter((part) => part?.trim())
    .join("\n");

  const files = collectUniqueRoundFiles(round);
  if (files.length === 0) {
    if (!corpus.trim()) return [];

    return [
      {
        id: "analysis-summary",
        originalName: "분석 요약",
        fileType: "text/plain",
        sizeBytes: corpus.length,
        storagePath: "",
        extractedTextPreview: corpus,
      },
    ];
  }

  return files.map((file, index) => ({
    id: file.id,
    originalName: file.originalName,
    fileType: file.fileType,
    sizeBytes: file.sizeBytes,
    storagePath: file.storageKey ?? "",
    extractedTextPreview: index === 0 ? corpus : "",
  }));
}

function buildStoredEvaluationContextFromRound(round: EvaluationRound): EvaluationContext {
  const analysis = round.aiAnalysis;

  return {
    spatial: analysis.spatialContext
      ? {
          address: analysis.spatialContext.address,
          point: { x: 0, y: 0, source: "address" },
          inLandscapeZone: analysis.spatialContext.inLandscapeZone,
          matchedZones: analysis.spatialContext.matchedZones,
          disclaimer: "",
        }
      : null,
    referenceLaws: (analysis.referenceLaws ?? []).map((law, index) => ({
      id: `stored-law-${index}`,
      title: law.title,
      article: law.article,
      summary: law.summary,
      ministry: "",
      enforcementDate: "",
      sourceUrl: law.sourceUrl,
      source: analysis.lawSource ?? "demo-fallback",
    })),
    referenceGuidelines: [],
    guidelines: [],
    lawSource: analysis.lawSource ?? "demo-fallback",
    guidelineSource: "demo-fallback",
    fetchedAt: analysis.contextFetchedAt ?? round.evaluatedAt,
    warnings: analysis.warnings ?? [],
  };
}

/** 저장된 평가 차수도 화면에서 항목별 고유 요약으로 보이도록 보정합니다. */
export function resolveDocumentSectionsForDisplay(
  round: EvaluationRound,
): EvaluationRound["aiAnalysis"]["documentSections"] {
  const files = buildFileSummariesFromRound(round);
  const evaluationContext = buildStoredEvaluationContextFromRound(round);

  return round.aiAnalysis.documentSections.map((section) => ({
    ...section,
    summary: sanitizeDocumentSectionSummary(section.label, section.summary, files, evaluationContext).text,
  }));
}
