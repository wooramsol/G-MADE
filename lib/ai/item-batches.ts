import type { EvaluationItem } from "../types";

/** Gemini·Claude는 한 번에 처리할 평가 항목 수를 제한합니다 (출력 JSON 잘림 방지). */
export const PROVIDER_ITEM_BATCH_SIZE = 3;

export function chunkEvaluationItems(
  items: EvaluationItem[],
  batchSize = PROVIDER_ITEM_BATCH_SIZE,
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
  return itemCount > PROVIDER_ITEM_BATCH_SIZE;
}
