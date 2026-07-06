import { sanitizeBrokenHangulQuotes } from "./document-text-utils";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;

/** ①②③ → 1. 2. 3. 으로 변환합니다. */
export function normalizeListNumbering(text: string): string {
  let normalized = text;
  for (let index = 0; index < CIRCLED_NUMBERS.length; index += 1) {
    normalized = normalized.replaceAll(CIRCLED_NUMBERS[index]!, `${index + 1}.`);
  }
  return normalized;
}

/** 평가 근거·의견 표시용 줄바꿈 정리 (1. 2. 3. 등) */
export function formatEvaluationText(text: string): string {
  let formatted = sanitizeBrokenHangulQuotes(normalizeListNumbering(text.trim()));
  if (!formatted) return "";

  formatted = formatted.replace(/(?<=\S)\s+(\d{1,2}\.)\s+(?=[「가-힣A-Za-z0-9])/g, "\n$1 ");
  formatted = formatted.replace(/(?<=\S)\s+([가나다]\.)\s+/g, "\n$1 ");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  return formatted.trim();
}

function normalizeForComparison(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[「」""'….,;:!?\-—]/g, "")
    .toLowerCase();
}

function splitIntoBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function splitNumberedItems(text: string): string[] {
  const items: string[] = [];
  const lines = text.split(/\n/);
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^\d{1,2}\.\s/.test(trimmed) && current) {
      items.push(current.trim());
      current = trimmed;
    } else {
      current = current ? `${current}\n${trimmed}` : trimmed;
    }
  }

  if (current.trim()) items.push(current.trim());
  return items.length > 0 ? items : [text.trim()];
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

function dedupeBlocks(existing: string[], incoming: string[]): string[] {
  const kept = [...existing];
  for (const block of incoming) {
    if (kept.some((item) => isDuplicateBlock(item, block))) continue;
    kept.push(block);
  }
  return kept;
}

/** rationale과 recommendation이 겹치지 않을 때만 합쳐 AI 블록 하나로 표시합니다. */
export function combineAiEvaluationText(rationale: string, recommendation: string): string {
  const reason = rationale.trim();
  const opinion = recommendation.trim();

  if (!reason && !opinion) return "";
  if (!opinion || reason === opinion) return reason;
  if (reason.includes(opinion)) return reason;
  if (opinion.includes(reason)) return opinion;

  const reasonBlocks = splitIntoBlocks(reason);
  const opinionBlocks = splitIntoBlocks(opinion);

  const reasonItems = reasonBlocks.flatMap((block) => splitNumberedItems(block));
  const opinionItems = opinionBlocks.flatMap((block) => splitNumberedItems(block));

  const uniqueOpinionItems = opinionItems.filter(
    (item) => !reasonItems.some((reasonItem) => isDuplicateBlock(reasonItem, item)),
  );

  if (uniqueOpinionItems.length === 0) return reason;

  const mergedOpinion = dedupeBlocks([], uniqueOpinionItems).join("\n");
  if (!mergedOpinion.trim()) return reason;

  const reasonLead = reasonBlocks.length === 1 && !/^\d{1,2}\.\s/.test(reason) ? reason : reason;
  return `${reasonLead}\n\n${mergedOpinion}`;
}
