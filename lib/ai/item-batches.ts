import type { EvaluationItem } from "../types";

/** Gemini도 Vercel 한도 안에서 끝나도록 배치 크기를 키웁니다. */
export const GEMINI_ITEM_BATCH_SIZE = 10;

/** Claude는 API 호출 횟수를 줄여 Vercel 시간 한도 안에서 완료합니다. */
export const CLAUDE_ITEM_BATCH_SIZE = 12;

/** @deprecated provider별 상수를 사용하세요. */
export const PROVIDER_ITEM_BATCH_SIZE = GEMINI_ITEM_BATCH_SIZE;

export function getProviderItemBatchSize(provider: "gemini" | "claude"): number {
  return provider === "claude" ? CLAUDE_ITEM_BATCH_SIZE : GEMINI_ITEM_BATCH_SIZE;
}

export function chunkEvaluationItems(
  items: EvaluationItem[],
  batchSize = GEMINI_ITEM_BATCH_SIZE,
): EvaluationItem[][] {
  if (items.length <= batchSize) {
    return [items];
  }

  const batches: EvaluationItem[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

export function shouldBatchProviderAnalysis(
  provider: "gemini" | "claude",
  itemCount: number,
): boolean {
  return itemCount > getProviderItemBatchSize(provider);
}
