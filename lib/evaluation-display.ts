import { sanitizeBrokenHangulQuotes } from "./document-text-utils";
import {
  combineAiEvaluationText,
  extractNumberedItems,
  formatEvaluationText,
  normalizeListNumbering,
  renumberEvaluationText,
} from "./format-evaluation-text";

export type StructuredEvaluationDisplay = {
  sources: string;
  summary: string;
  grounds: string[];
  actions: string[];
};

const FILE_QUOTE_PATTERN = /「([^」]+)」/g;
const PAGE_PATTERN = /\bp\.(\d+)\b/gi;

const BOILERPLATE_LINES =
  /^(?:다음\s*(?:평가\s*근거|검토|사항).*(?:확인됨|필요)|관련\s*도면·계획서에\s*위치|실시설계\s*단계에서\s*구체화|심사위원\s*검토가\s*필요)/;

const ACTION_LINE_PATTERN = /(?:하시기\s*바랍니다|재확인\s*하시기\s*바랍니다|검토하시기\s*바랍니다)\.?$/;

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

function shortenFileName(name: string): string {
  if (name.length <= 42) return name;
  return `${name.slice(0, 20)}…${name.slice(-18)}`;
}

function buildSourcesLabel(files: string[], pages: number[]): string {
  const parts: string[] = [];
  if (files.length > 0) {
    parts.push(files.map(shortenFileName).join(", "));
  }
  if (pages.length > 0) {
    parts.push(`p.${pages.join(", p.")}`);
  }
  return parts.join(" · ");
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

function dedupeLines(lines: string[]): string[] {
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isBoilerplateLine(trimmed)) continue;
    const signature = normalizeForComparison(trimmed);
    if (kept.some((existing) => {
      const existingSignature = normalizeForComparison(existing);
      return (
        existingSignature === signature ||
        (signature.length >= 40 &&
          existingSignature.length >= 40 &&
          (existingSignature.includes(signature) || signature.includes(existingSignature)))
      );
    })) {
      continue;
    }
    kept.push(trimmed);
  }
  return kept;
}

function classifyItem(text: string): "ground" | "action" {
  return ACTION_LINE_PATTERN.test(text.trim()) ? "action" : "ground";
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
  let compact = stripRepeatedFileQuotes(text, files);
  compact = compact.replace(/\s*—\s*—\s*/g, " — ");
  compact = compact.replace(/\s{2,}/g, " ").trim();

  const lawMatch = compact.match(/((?:경관|장애인|녹지|건축|공공디자인)[^.]{0,30}제\s*\d+\s*조[^.]{0,40})/);
  if (lawMatch) {
    const law = lawMatch[1]!.trim();
    const rest = compact.replace(lawMatch[1]!, "").replace(/\s*—\s*/g, " ").trim();
    compact = rest ? `${rest} — ${law}` : law;
  }

  return compact;
}

/** 평가 근거·의견을 화면용으로 압축·구조화합니다. */
export function structureEvaluationDisplay(text: string): StructuredEvaluationDisplay {
  const normalized = formatEvaluationText(text);
  const { lead, items } = extractNumberedItems(normalized);

  const corpus = [lead, ...items].join("\n");
  const files = extractQuotedFiles(corpus);
  const pages = extractPageNumbers(corpus);
  const sources = buildSourcesLabel(files, pages);

  const leadLines = dedupeLines(lead.split(/\n/).map((line) => stripRepeatedFileQuotes(line, files)));
  let summary = leadLines.join(" ").replace(/\s{2,}/g, " ").trim();
  if (summary.length > 180) {
    summary = `${summary.slice(0, 177)}…`;
  }

  const compactItems = dedupeItems(
    items.map((item) => compactItemText(item, files)).filter(Boolean),
  );

  const grounds: string[] = [];
  const actions: string[] = [];
  for (const item of compactItems) {
    if (classifyItem(item) === "action") {
      actions.push(item);
    } else {
      grounds.push(item);
    }
  }

  return { sources, summary, grounds, actions };
}

/** rationale·recommendation을 합쳐 구조화된 평가 표시 데이터로 만듭니다. */
export function prepareEvaluationDisplay(rationale: string, recommendation: string): StructuredEvaluationDisplay {
  const combined = combineAiEvaluationText(rationale, recommendation);
  return structureEvaluationDisplay(combined);
}

export { combineAiEvaluationText, formatEvaluationText, normalizeListNumbering, renumberEvaluationText };
