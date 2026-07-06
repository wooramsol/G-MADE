import type { EvaluationContext } from "../evaluation-context";
import { collectUniqueRoundFiles } from "../evaluation-round-files";
import type { EvaluationItem, EvaluationRound } from "../types";
import {
  hasBrokenHangulLead,
  normalizeDocumentText,
  sanitizeBrokenHangulQuotes,
  sliceGraphemeRange,
  truncateGraphemes,
} from "../document-text-utils";
import type { UploadedFileSummary } from "./analysis-types";
import {
  getDocumentKeywordsForItem,
  matchItemBySectionLabel,
  matchItemBySectionRecord,
  type DocumentSectionRecord,
} from "./evaluation-item-document-hints";
import { buildAnalysisCorpus, checkEvaluationTextGrounding } from "./grounding-guard";
import { extractEvidenceWithPage, formatPageReference } from "./page-citation";

const GENERIC_SECTION_BOILERPLATE =
  /제출\s*자료\s*전반에서\s*심사위원이\s*우선\s*재확인|항목별\s*검토·보완\s*의견을\s*확인하세요|AI가\s*해당\s*자료를\s*분석했습니다/;

const EVALUATIVE_SECTION_MARKERS =
  /미기재|불명확|보완\s*(?:필요|검토)|심사위원\s*재확인|미흡|저촉|누락|모순|기준\s*미달|검토\s*필요|재검토|부족(?:함|하여)|제시되지\s*않|확인(?:되지|불가)/i;

const LOCATION_REFERENCE_PATTERN = /「[^」]+」\s*p\.\d+|p\.\d+|슬라이드\s*\d+|---\s*「[^」]+」/i;

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

function mentionsSectionKeywords(text: string, keywords: string[]): boolean {
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
      const line = `${pageRef} ${trimmed} — ${snippet}`;
      const key = line.slice(0, 48);
      if (!seen.has(key)) {
        seen.add(key);
        locations.push(line);
      }
    }
  }

  return locations;
}

export function buildFallbackDocumentSectionSummary(
  item: EvaluationItem,
  files: UploadedFileSummary[],
): string {
  const label = item.detailItem;
  const corpus = buildAnalysisCorpus(files);
  const keywords = getDocumentKeywordsForItem(item);
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
    return `1. ${sourceLabel} — ${label} 관련 도면·본문 검색 (텍스트에서 관련 키워드 일부 확인)`;
  }

  return `1. ${sourceLabel} — ${label} 관련 제출 자료 (텍스트 추출 제한)`;
}

export function sanitizeDocumentSectionSummary(
  item: EvaluationItem,
  rawSummary: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): { text: string; warning?: string } {
  const label = item.detailItem;
  const keywords = getDocumentKeywordsForItem(item);
  const text = rawSummary.trim();

  if (
    !isGenericSectionSummary(text) &&
    !isEvaluativeDocumentSummary(text) &&
    mentionsSectionKeywords(text, keywords) &&
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
    mentionsSectionKeywords(text, keywords) &&
    (hasLocationReference(text) || text.includes("—"))
  ) {
    return { text: sanitizeBrokenHangulQuotes(text) };
  }

  const fallback = sanitizeBrokenHangulQuotes(buildFallbackDocumentSectionSummary(item, files));
  const warning =
    text && text !== fallback
      ? `${label} 요약: 평가 문구가 포함되어 읽은 위치 목록으로 보정했습니다.`
      : undefined;

  return { text: fallback, warning };
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pickSectionForItem(
  item: EvaluationItem,
  sections: DocumentSectionRecord[],
  usedIndexes: Set<number>,
): DocumentSectionRecord | undefined {
  const byIdIndex = sections.findIndex(
    (section, index) => !usedIndexes.has(index) && section.itemId === item.id,
  );
  if (byIdIndex >= 0) {
    usedIndexes.add(byIdIndex);
    return sections[byIdIndex];
  }

  const byLabelIndex = sections.findIndex((section, index) => {
    if (usedIndexes.has(index)) return false;
    return matchItemBySectionLabel(section.label, [item]) !== undefined;
  });
  if (byLabelIndex >= 0) {
    usedIndexes.add(byLabelIndex);
    return sections[byLabelIndex];
  }

  const legacyIndex = sections.findIndex((section, index) => {
    if (usedIndexes.has(index)) return false;
    return matchItemBySectionRecord(section, [item]) !== undefined;
  });
  if (legacyIndex >= 0) {
    usedIndexes.add(legacyIndex);
    return sections[legacyIndex];
  }

  return undefined;
}

/** AI·저장 데이터의 documentSections를 평가항목 목록과 1:1로 맞춥니다. */
export function alignDocumentSectionsToEvaluationItems(
  items: EvaluationItem[],
  sections: DocumentSectionRecord[],
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  groundingWarnings: string[] = [],
): DocumentSectionRecord[] {
  if (items.length === 0) return [];

  const usedIndexes = new Set<number>();
  return items.map((item) => {
    const matched = pickSectionForItem(item, sections, usedIndexes);
    const rawSummary = matched?.summary ?? "";
    const summaryResult = sanitizeDocumentSectionSummary(item, rawSummary, files, evaluationContext);
    if (summaryResult.warning) {
      groundingWarnings.push(summaryResult.warning);
    }

    return {
      itemId: item.id,
      label: item.detailItem,
      confidence: clampConfidence(Number(matched?.confidence ?? 75)),
      summary: summaryResult.text,
    };
  });
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

/** 저장된 평가 차수도 화면에서 평가항목과 일치하는 문서 이해 카드로 보이도록 보정합니다. */
export function resolveDocumentSectionsForDisplay(
  round: EvaluationRound,
): EvaluationRound["aiAnalysis"]["documentSections"] {
  const items = round.evaluationItems;
  if (items.length === 0) return round.aiAnalysis.documentSections;

  const files = buildFileSummariesFromRound(round);
  const evaluationContext = buildStoredEvaluationContextFromRound(round);
  const storedSections: DocumentSectionRecord[] = round.aiAnalysis.documentSections.map((section) => ({
    itemId: "itemId" in section ? (section as DocumentSectionRecord).itemId : undefined,
    label: section.label,
    confidence: section.confidence,
    summary: section.summary,
  }));

  return alignDocumentSectionsToEvaluationItems(items, storedSections, files, evaluationContext);
}
