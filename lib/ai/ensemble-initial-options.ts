import type { AnalysisPromptOptions } from "./analysis-prompt-options";
import type { AiProviderId } from "./types";

/** 종합 평가 1단계: 엔진별 초기 분석 옵션(시간 한도 내 완료 우선) */
export function resolveEnsembleInitialOptions(provider: AiProviderId): AnalysisPromptOptions | undefined {
  if (provider === "claude") {
    return {
      compact: true,
      includeVision: false,
      ensembleFast: true,
    };
  }

  if (provider === "openai") {
    return { compact: true };
  }

  return undefined;
}
