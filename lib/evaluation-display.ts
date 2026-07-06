import { isUsableQuoteSnippet } from "./document-text-utils";
import type { UploadedFileSummary } from "./ai/analysis-types";
import { resolvePageEvidence } from "./ai/page-citation";
import {
  combineAiEvaluationText,
  extractNumberedItems,
  formatEvaluationText,
  normalizeListNumbering,
  renumberEvaluationText,
} from "./format-evaluation-text";

export type EvaluationPoint = {
  content: string;
  evidence: string;
};

export type StructuredEvaluationDisplay = {
  points: EvaluationPoint[];
};

const FILE_QUOTE_PATTERN = /「([^」]+)」/g;
const PAGE_PATTERN = /\bp\.(\d+)\b/gi;
const LAW_IN_TEXT_PATTERN =
  /((?:경관(?:의)?\s*법률|경관\s*법|경관법|장애인|녹지|건축|공공디자인|빛공해|행정절차)[^—\n]{0,48}제\s*\d+\s*조[^—\n]{0,32}|[^—\n]{0,24}지침[^—\n]{0,48})/g;

const BOILERPLATE_LINES =
  /^(?:다음\s*(?:평가\s*근거|검토|사항).*(?:확인됨|필요)|관련\s*도면·계획서에\s*위치|실시설계\s*단계에서\s*구체화|심사위원\s*검토가\s*필요)/;

const BOILERPLATE_CONTENT =
  /(?:등을?\s*검토한\s*결과|다음\s*사항의\s*수정·보완·재확인이\s*필요|실시설계\s*단계에서\s*구체화|관련\s*도면·계획서에\s*위치·동선을\s*표기)/;

function isInvalidPointContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (isBoilerplateLine(trimmed)) return true;
  if (BOILERPLATE_CONTENT.test(trimmed)) return true;
  if (/^["「]?\s*\.{2,}\s*["」]?\s*등\s*확인/.test(trimmed)) return true;
  if (/^["「]?\s*\.{2,}/.test(trimmed)) return true;
  if (!isUsableQuoteSnippet(trimmed) && /^["「].*["」]?\s*등/.test(trimmed)) return true;
  if (trimmed.length < 8) return true;
  return false;
}

function sanitizePointContent(content: string): string {
  return content
    .replace(/^["「]\s*\.{2,}\s*["」]\s*등\s*(?:확인|검토)[^.]*\.?\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const TOPIC_KEYWORDS = [
  "스카이라인",
  "매스분절",
  "매스 분절",
  "동선",
  "주차",
  "색채",
  "입면",
  "보행",
  "난간",
  "계단",
  "조명",
  "식재",
] as const;

function normalizeForComparison(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[「」""'….,;:!?\-—]/g, "")
    .replace(/p\.\d+/gi, "pN")
    .replace(/제\s*\d+\s*조/g, "제N조")
    .toLowerCase();
}

function itemSignature(text: string): string {
  return normalizeForComparison(
    text.replace(/「[^」]+」/g, "").replace(/^p\.\d+\s*[—\-]\s*/i, ""),
  );
}

function extractQuotedFiles(text: string): string[] {
  const files = new Set<string>();
  for (const match of text.matchAll(FILE_QUOTE_PATTERN)) {
    const name = match[1]?.trim();
    if (name) files.add(name);
  }
  return [...files];
}

function extractPageNumbers(text: string): number[] {
  const pages = new Set<number>();
  for (const match of text.matchAll(PAGE_PATTERN)) {
    const page = Number(match[1]);
    if (Number.isFinite(page)) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function stripRepeatedFileQuotes(text: string, files: string[]): string {
  let result = text.trim();
  for (const file of files) {
    result = result.replaceAll(`「${file}」`, "").replace(/\s{2,}/g, " ");
  }
  return result.replace(/^\s*[—\-]\s*/, "").trim();
}

function isBoilerplateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (BOILERPLATE_LINES.test(trimmed)) return true;
  if (/^다음\s*평가\s*근거가\s*확인됨/.test(trimmed)) return true;
  return false;
}

function shareTopicAndLocation(a: string, b: string): boolean {
  const pageA = a.match(/\bp\.(\d+)\b/i)?.[0] ?? "";
  const pageB = b.match(/\bp\.(\d+)\b/i)?.[0] ?? "";
  if (pageA && pageB && pageA !== pageB) return false;

  const topicA = TOPIC_KEYWORDS.find((keyword) => a.includes(keyword));
  const topicB = TOPIC_KEYWORDS.find((keyword) => b.includes(keyword));
  return Boolean(topicA && topicB && topicA === topicB);
}

function dedupeItems(items: string[]): string[] {
  const kept: string[] = [];

  for (const item of items) {
    const signature = itemSignature(item);
    if (!signature) continue;

    const duplicateIndex = kept.findIndex((existing) => {
      const existingSignature = itemSignature(existing);
      if (existingSignature === signature) return true;
      if (shareTopicAndLocation(existing, item)) return true;
      if (existingSignature.length < 28 || signature.length < 28) return false;
      const shorter = existingSignature.length <= signature.length ? existingSignature : signature;
      const longer = existingSignature.length <= signature.length ? signature : existingSignature;
      return longer.includes(shorter.slice(0, Math.min(40, shorter.length)));
    });

    if (duplicateIndex >= 0) {
      if (item.length > kept[duplicateIndex]!.length) {
        kept[duplicateIndex] = item;
      }
      continue;
    }

    kept.push(item);
  }

  return kept;
}

function compactItemText(text: string, files: string[]): string {
  return stripRepeatedFileQuotes(text, files).replace(/\s{2,}/g, " ").trim();
}

function looksLikeLocation(part: string): boolean {
  return /\bp\.\d+/i.test(part) || /배치도|입면도|조감|동선|체크리스트|계획서|색채|야간/.test(part);
}

function extractLawTexts(text: string): string[] {
  const laws = new Set<string>();
  for (const match of text.matchAll(LAW_IN_TEXT_PATTERN)) {
    const value = match[1]?.trim();
    if (value) laws.add(value);
  }
  return [...laws];
}

function extractPageLocation(text: string): string {
  const page = text.match(/\bp\.(\d+)\b/i)?.[0];
  const drawing = text.match(/(배치도|입면도|조감도|동선도|체크리스트|색채계획|야간경관)/)?.[0];
  if (page && drawing) return `${page} ${drawing}`;
  if (page) return page;
  return drawing ?? "";
}

function splitPointItem(
  text: string,
  fallbackEvidence: string,
): { content: string; evidence: string } {
  const lawTexts = extractLawTexts(text);
  let working = text.trim();
  for (const law of lawTexts) {
    working = working.replace(law, "").replace(/\s*[—\-]\s*/g, " — ").trim();
  }
  working = working.replace(/\s*—\s*$/g, "").replace(/\s*—\s*—/g, " — ").trim();

  const parts = working.split(/\s*—\s*/).map((part) => part.trim()).filter(Boolean);
  let evidence = "";
  let content = working;

  if (parts.length >= 2 && looksLikeLocation(parts[0]!)) {
    evidence = parts[0]!;
    content = parts.slice(1).join(" — ");
  } else {
    evidence = extractPageLocation(working);
    content = working;
  }

  if (!evidence) {
    evidence = /^\s*p\.\d+(?:\s*,\s*p\.\d+)*\s*$/.test(fallbackEvidence) ? "" : fallbackEvidence;
  }
  content = sanitizePointContent(content.replace(/^\s*[—\-]\s*/, "").trim());

  return {
    content: content || sanitizePointContent(text.trim()),
    evidence,
  };
}

function buildFallbackEvidence(files: string[], pages: number[]): string {
  const parts: string[] = [];
  if (pages.length > 0) parts.push(`p.${pages.join(", p.")}`);
  if (files.length === 1) parts.unshift(files[0]!.length > 36 ? `${files[0]!.slice(0, 18)}…` : files[0]!);
  return parts.join(" ");
}

/** 평가 근거·의견을 화면용 평가 포인트 목록으로 변환합니다. */
export function structureEvaluationDisplay(
  text: string,
  fileSummaries: UploadedFileSummary[] = [],
): StructuredEvaluationDisplay {
  const normalized = formatEvaluationText(text);
  const { items } = extractNumberedItems(normalized);

  const corpus = items.join("\n");
  const quotedFiles = extractQuotedFiles(corpus);
  const pages = extractPageNumbers(corpus);
  const fallbackEvidence = buildFallbackEvidence(quotedFiles, pages);

  const compactItems = dedupeItems(
    items.map((item) => compactItemText(item, quotedFiles)).filter(Boolean),
  );

  const points: EvaluationPoint[] = [];
  for (const item of compactItems) {
    if (isBoilerplateLine(item)) continue;

    const split = splitPointItem(item, fallbackEvidence);
    if (isInvalidPointContent(split.content)) continue;

    const resolvedEvidence = fileSummaries.length > 0
      ? resolvePageEvidence(fileSummaries, split.evidence, split.content)
      : split.evidence;

    points.push({
      content: split.content,
      evidence: resolvedEvidence,
    });
  }

  return { points };
}

/** rationale·recommendation을 합쳐 구조화된 평가 표시 데이터로 만듭니다. */
export function prepareEvaluationDisplay(
  rationale: string,
  recommendation: string,
  fileSummaries: UploadedFileSummary[] = [],
): StructuredEvaluationDisplay {
  const combined = combineAiEvaluationText(rationale, recommendation);
  return structureEvaluationDisplay(combined, fileSummaries);
}

export { combineAiEvaluationText, formatEvaluationText, normalizeListNumbering, renumberEvaluationText };
