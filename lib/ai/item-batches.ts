import type { EvaluationItem } from "../types";
import type { AiProviderId } from "./types";

/**
 * 한 번에 처리할 평가 항목 수 제한 (출력 JSON 잘림 방지).
 * OpenAI는 json_object 모드가 안정적이어서 더 큰 배치를 허용한다.
 */
const PROVIDER_ITEM_BATCH_SIZES: Record<AiProviderId, number> = {
  gemini: 3,
  claude: 3,
  openai: 8,
};

export function getProviderItemBatchSize(provider: AiProviderId): number {
  return PROVIDER_ITEM_BATCH_SIZES[provider];
}

export function chunkEvaluationItems(
  items: EvaluationItem[],
  batchSize: number,
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
  provider: AiProviderId,
  itemCount: number,
): boolean {
  return itemCount > getProviderItemBatchSize(provider);
}
