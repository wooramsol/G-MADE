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
import { extractEvidenceWithPage, formatPageReference } from "./page-citation";

const GENERIC_SECTION_BOILERPLATE =
  /제출\s*자료\s*전반에서\s*심사위원이\s*우선\s*재확인|항목별\s*검토·보완\s*의견을\s*확인하세요|AI가\s*해당\s*자료를\s*분석했습니다/;

const EVALUATIVE_SECTION_MARKERS =
  /미기재|불명확|보완\s*(?:필요|검토)|심사위원\s*재확인|미흡|저촉|누락|모순|기준\s*미달|검토\s*필요|재검토|부족(?:함|하여)|제시되지\s*않|확인(?:되지|불가)/i;

const LOCATION_REFERENCE_PATTERN = /「[^」]+」\s*p\.\d+|p\.\d+|슬라이드\s*\d+|---\s*「[^」]+」/i;

const SECTION_KEYWORDS: Record<string, string[]> = {
  건축개요: ["건축개요", "연면적", "층수", "용도", "규모", "구조", "사업개요"],
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
  return normalized.length < 20;
}

function isEvaluativeDocumentSummary(text: string): boolean {
  return EVALUATIVE_SECTION_MARKERS.test(text.trim());
}

function hasLocationReference(text: string): boolean {
  return LOCATION_REFERENCE_PATTERN.test(text);
}

function collectPageMarkersFromCorpus(corpus: string, fileName: string, keywords: string[]): string[] {
  const normalizedCorpus = corpus.normalize("NFC");
  const lowerCorpus = normalizedCorpus.toLowerCase();
  const locations: string[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) continue;

    let searchFrom = 0;
    while (searchFrom < lowerCorpus.length && locations.length < 4) {
      const idx = lowerCorpus.indexOf(trimmed.toLowerCase(), searchFrom);
      if (idx < 0) break;
      searchFrom = idx + trimmed.length;

      const evidence = extractEvidenceWithPage(normalizedCorpus, [trimmed], 60);
      const pageRef = evidence.pageRef ?? formatPageReference(fileName, 1);
      const snippet = evidence.snippet ? truncateGraphemes(evidence.snippet, 80) : trimmed;
      const line = `${pageRef} ${labelSectionName(trimmed)} — ${snippet}`;
      const key = line.slice(0, 48);
      if (!seen.has(key)) {
        seen.add(key);
        locations.push(line);
      }
    }
  }

  return locations;
}

function labelSectionName(keyword: string): string {
  return keyword;
}

export function buildFallbackDocumentSectionSummary(
  label: string,
  files: UploadedFileSummary[],
): string {
  const corpus = buildAnalysisCorpus(files);
  const keywords = SECTION_KEYWORDS[label] ?? [label];
  const relevantFile = findRelevantFile(files, keywords);
  const sourceLabel = relevantFile ? `「${relevantFile.originalName}」` : "제출 자료";
  const snippet = extractSectionSnippet(corpus, keywords);

  if (relevantFile) {
    const locations = collectPageMarkersFromCorpus(
      relevantFile.extractedTextPreview ?? corpus,
      relevantFile.originalName,
      keywords,
    );
    if (locations.length > 0) {
      return locations.map((line, index) => `${index + 1}. ${line}`).join("\n");
    }
  }

  if (snippet && !hasBrokenHangulLead(snippet)) {
    return `1. ${sourceLabel} — ${label} 관련 "${snippet}" 확인`;
  }

  if (corpus.trim().length > 60) {
    return `1. ${sourceLabel} — ${label} 관련 도면·본문 검색 (텍스트에서 ${label} 키워드 일부 확인)`;
  }

  return `1. ${sourceLabel} — ${label} 관련 제출 자료 (텍스트 추출 제한)`;
}

export function sanitizeDocumentSectionSummary(
  label: string,
  rawSummary: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): { text: string; warning?: string } {
  const text = rawSummary.trim();

  if (
    !isGenericSectionSummary(text) &&
    !isEvaluativeDocumentSummary(text) &&
    mentionsSectionLabel(text, label) &&
    hasLocationReference(text)
  ) {
    const grounding = checkEvaluationTextGrounding(text, files, evaluationContext);
    if (grounding.grounded) {
      return { text: sanitizeBrokenHangulQuotes(text) };
    }
  }

  if (
    !isGenericSectionSummary(text) &&
    !isEvaluativeDocumentSummary(text) &&
    text.length >= 32 &&
    mentionsSectionLabel(text, label) &&
    (hasLocationReference(text) || text.includes("—"))
  ) {
    return { text: sanitizeBrokenHangulQuotes(text) };
  }

  const fallback = sanitizeBrokenHangulQuotes(buildFallbackDocumentSectionSummary(label, files));
  const warning =
    text && text !== fallback
      ? `${label} 요약: 평가 문구가 포함되어 읽은 위치 목록으로 보정했습니다.`
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
