import { sanitizeBrokenHangulQuotes } from "./document-text-utils";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;
const NUMBERED_LINE_PATTERN = /^(\d{1,2})\.\s+(.+)$/;
const INTRO_LINE_PATTERN = /(?:있으나|검토한\s*결과|다음\s*(?:평가\s*근거|검토|사항)|확인됨)[:,.]?\s*$/;

/** ①②③ → 1. 2. 3. 으로 변환합니다. */
export function normalizeListNumbering(text: string): string {
  let normalized = text;
  for (let index = 0; index < CIRCLED_NUMBERS.length; index += 1) {
    normalized = normalized.replaceAll(CIRCLED_NUMBERS[index]!, `${index + 1}.`);
  }
  return normalized;
}

function stripLeadingNumber(text: string): string {
  return text.replace(/^\d{1,2}\.\s+/, "").trim();
}

function isIntroNumberedLine(text: string): boolean {
  return INTRO_LINE_PATTERN.test(text.trim());
}

export function extractNumberedItems(text: string): { lead: string; items: string[] } {
  const normalized = text.trim();
  if (!normalized) return { lead: "", items: [] };

  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const leadParts: string[] = [];
  const items: string[] = [];

  for (const block of blocks) {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    let blockLead: string[] = [];
    let currentItem = "";

    for (const line of lines) {
      const numbered = line.match(NUMBERED_LINE_PATTERN);
      if (numbered) {
        if (currentItem) {
          items.push(stripLeadingNumber(currentItem));
        } else if (blockLead.length > 0) {
          leadParts.push(blockLead.join("\n"));
          blockLead = [];
        }
        currentItem = numbered[2] ?? line;
        continue;
      }

      if (currentItem) {
        currentItem += `\n${line}`;
      } else {
        blockLead.push(line);
      }
    }

    if (currentItem) {
      items.push(stripLeadingNumber(currentItem));
    } else if (blockLead.length > 0) {
      leadParts.push(blockLead.join("\n"));
    }
  }

  let lead = leadParts.join("\n\n").trim();
  let normalizedItems = items.map((item) => item.trim()).filter(Boolean);

  if (normalizedItems.length > 1 && isIntroNumberedLine(normalizedItems[0]!)) {
    lead = lead ? `${lead}\n${normalizedItems[0]}` : normalizedItems[0]!;
    normalizedItems = normalizedItems.slice(1);
  }

  return { lead, items: normalizedItems };
}

export function formatNumberedEvaluation(lead: string, items: string[]): string {
  const body = items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  if (!lead) return body;
  if (!body) return lead;
  return `${lead}\n\n${body}`;
}

/** 본문 전체의 번호 목록을 1부터 연속으로 다시 매깁니다. */
export function renumberEvaluationText(text: string): string {
  const { lead, items } = extractNumberedItems(text);
  if (items.length === 0) return lead;
  return formatNumberedEvaluation(lead, items);
}

/** 평가 근거·의견 표시용 줄바꿈 정리 (1. 2. 3. 등) */
export function formatEvaluationText(text: string): string {
  let formatted = sanitizeBrokenHangulQuotes(normalizeListNumbering(text.trim()));
  if (!formatted) return "";

  formatted = formatted.replace(/(?<=\S)\s+(\d{1,2}\.)\s+(?=[「가-힣A-Za-z0-9])/g, "\n$1 ");
  formatted = formatted.replace(/(?<=\S)\s+([가나다]\.)\s+/g, "\n$1 ");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  return renumberEvaluationText(formatted.trim());
}

function normalizeForComparison(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[「」""'….,;:!?\-—]/g, "")
    .toLowerCase();
}

function isDuplicateBlock(a: string, b: string): boolean {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.length >= 24 && normB.length >= 24) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }

  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length <= normB.length ? normB : normA;
  if (shorter.length >= 32 && longer.includes(shorter.slice(0, Math.min(48, shorter.length)))) {
    return true;
  }

  return false;
}

/** rationale과 recommendation이 겹치지 않을 때만 합쳐 AI 블록 하나로 표시합니다. */
export function combineAiEvaluationText(rationale: string, recommendation: string): string {
  const reason = rationale.trim();
  const opinion = recommendation.trim();

  if (!reason && !opinion) return "";
  if (!opinion || reason === opinion) return renumberEvaluationText(reason);
  if (reason.includes(opinion)) return renumberEvaluationText(reason);
  if (opinion.includes(reason)) return renumberEvaluationText(opinion);

  const reasonParsed = extractNumberedItems(reason);
  const opinionParsed = extractNumberedItems(opinion);

  const uniqueOpinionItems = opinionParsed.items.filter(
    (item) => !reasonParsed.items.some((reasonItem) => isDuplicateBlock(reasonItem, item)),
  );

  const lead = [reasonParsed.lead, opinionParsed.lead].filter(Boolean).join("\n\n");
  const mergedItems = [...reasonParsed.items, ...uniqueOpinionItems];

  if (mergedItems.length === 0) {
    return lead || reason;
  }

  return formatNumberedEvaluation(lead, mergedItems);
}
