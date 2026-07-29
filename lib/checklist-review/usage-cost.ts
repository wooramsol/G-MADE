import type { ClaudeUsage } from "./claude-call";

/**
 * 검토 1건에 사용된 Claude 토큰을 모델별로 합산하고, 대략적인 비용(USD)을 추정합니다.
 * (개발자 진단용 — 화면에는 작은 보조 표기로만 노출합니다. 캐시 할인율 등 세부 조건에
 * 따라 Anthropic 콘솔의 실제 청구액과는 다소 차이가 날 수 있는 근사치입니다.)
 */

export type UsageByModel = Map<string, ClaudeUsage>;

function emptyUsage(): ClaudeUsage {
  return { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}

/** usageByModel에 한 호출의 사용량을 더합니다. usage가 없으면(예: 캐시된 응답 등) 아무 것도 하지 않습니다. */
export function addUsage(target: UsageByModel, model: string, usage?: ClaudeUsage): void {
  if (!usage || !model) return;
  const current = target.get(model) ?? emptyUsage();
  target.set(model, {
    inputTokens: current.inputTokens + usage.inputTokens,
    outputTokens: current.outputTokens + usage.outputTokens,
    cacheCreationInputTokens: current.cacheCreationInputTokens + usage.cacheCreationInputTokens,
    cacheReadInputTokens: current.cacheReadInputTokens + usage.cacheReadInputTokens,
  });
}

/** source의 모든 모델별 사용량을 target에 더합니다. */
export function mergeUsageByModel(target: UsageByModel, source: UsageByModel): void {
  for (const [model, usage] of source) addUsage(target, model, usage);
}

/**
 * Anthropic 공개 단가($/1M 토큰, 2026.07 기준). 캐시 쓰기는 5분 캐시(1.25배) 기준으로
 * 근사합니다(1시간 캐시 2배는 이 앱에서 사용하지 않음). 알 수 없는 모델명은 haiku가
 * 포함되어 있지 않으면 sonnet 단가로 근사합니다.
 */
const PRICING_PER_MILLION: Record<"sonnet" | "haiku", { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

function pricingTier(model: string): "sonnet" | "haiku" {
  return model.toLowerCase().includes("haiku") ? "haiku" : "sonnet";
}

export type UsageSummary = {
  totalTokens: number;
  costUsd: number;
};

/** 모델별 사용량 합계를 총 토큰 수·추정 비용(USD)으로 환산합니다. */
export function estimateUsageSummary(usageByModel: UsageByModel): UsageSummary {
  let totalTokens = 0;
  let costUsd = 0;

  for (const [model, usage] of usageByModel) {
    totalTokens += usage.inputTokens + usage.outputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;

    const price = PRICING_PER_MILLION[pricingTier(model)];
    costUsd +=
      (usage.inputTokens / 1_000_000) * price.input +
      (usage.outputTokens / 1_000_000) * price.output +
      (usage.cacheCreationInputTokens / 1_000_000) * price.cacheWrite +
      (usage.cacheReadInputTokens / 1_000_000) * price.cacheRead;
  }

  return { totalTokens, costUsd };
}

/**
 * 개발자 전용 소형 표기: "{천 단위로 반올림한 토큰 수}k{달러(소수 2자리)}"
 * 예) 총 999,000토큰·$9.99 -> "999k9.99"
 */
export function formatUsageLabel(summary: UsageSummary): string {
  const kTokens = Math.round(summary.totalTokens / 1000);
  return `${kTokens}k${summary.costUsd.toFixed(2)}`;
}
