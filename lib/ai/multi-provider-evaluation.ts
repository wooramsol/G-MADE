import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import { AiAnalysisError } from "./analysis-error";
import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import { buildArbiterSynthesisPrompt } from "./cross-feedback-prompt";
import { mergeConsensusAnalysis } from "./consensus-merge";
import {
  ENSEMBLE_ARBITER_TIMEOUT_MS,
  ENSEMBLE_CLAUDE_INITIAL_TIMEOUT_MS,
  ENSEMBLE_INITIAL_PROVIDER_TIMEOUT_MS,
  ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS,
  withOperationTimeout,
} from "./ensemble-time-budget";
import { formatProviderBadgeLabel } from "./provider-labels";
import { getConfiguredLiveProviders, resolveArbiterProvider } from "./select-provider";
import type { AiProviderId } from "./types";
import { analyzeUploadedFilesWithProvider } from "../upload-analysis";

export type MultiProviderEvaluationResult = {
  consensus: UploadAnalysisResult;
  initialByProvider: Partial<Record<AiProviderId, UploadAnalysisResult>>;
  crossFeedbackByProvider: Partial<Record<AiProviderId, UploadAnalysisResult>>;
  providersUsed: AiProviderId[];
  warnings: string[];
};

type ProviderAnalysisEntry = {
  provider: AiProviderId;
  analysis: UploadAnalysisResult;
};

export async function analyzeWithMultiProviderEnsemble(input: {
  files: UploadedFileSummary[];
  evaluationContext: EvaluationContext;
  evaluationItems: EvaluationItem[];
  onAnalysisProgress?: (label: string) => void;
  getRemainingBudgetMs?: () => number;
}): Promise<MultiProviderEvaluationResult> {
  const { files, evaluationContext, evaluationItems, onAnalysisProgress, getRemainingBudgetMs } = input;
  const providers = getConfiguredLiveProviders();

  if (providers.length === 0) {
    throw new AiAnalysisError(
      "AI API 키가 설정되지 않았습니다. Vercel Production 환경에 GEMINI_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY를 추가한 뒤 Redeploy 해 주세요.",
    );
  }

  if (providers.length === 1) {
    const provider = providers[0]!;
    onAnalysisProgress?.(`${formatProviderBadgeLabel(provider)} AI 평가 분석`);
    const analysis = await analyzeUploadedFilesWithProvider(provider, {
      files,
      evaluationContext,
      evaluationItems,
      onAnalysisProgress,
    });

    return {
      consensus: {
        ...analysis,
        warnings: [
          ...(analysis.warnings ?? []),
          `설정된 AI 엔진이 ${formatProviderBadgeLabel(provider)} 1개뿐이라 종합(ensemble) 상호 검토는 생략했습니다.`,
        ],
      },
      initialByProvider: { [provider]: analysis },
      crossFeedbackByProvider: {},
      providersUsed: [provider],
      warnings: analysis.warnings ?? [],
    };
  }

  const warnings: string[] = [...evaluationContext.warnings];
  warnings.push(
    `AI 종합 평가: ${providers.map((provider) => formatProviderBadgeLabel(provider)).join(", ")} ${providers.length}개 엔진을 병렬 분석합니다.`,
  );

  const remainingForInitial = getRemainingBudgetMs?.() ?? ENSEMBLE_INITIAL_PROVIDER_TIMEOUT_MS + ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS;

  function resolveInitialProviderTimeout(provider: AiProviderId): number {
    const providerCap =
      provider === "claude" ? ENSEMBLE_CLAUDE_INITIAL_TIMEOUT_MS : ENSEMBLE_INITIAL_PROVIDER_TIMEOUT_MS;
    return Math.min(providerCap, Math.max(60_000, remainingForInitial - ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS - 5_000));
  }

  onAnalysisProgress?.(`1단계: ${providers.length}개 AI 엔진 병렬 분석`);
  const initialResults = await Promise.allSettled(
    providers.map(async (provider) => {
      const label = formatProviderBadgeLabel(provider);
      onAnalysisProgress?.(`${label} 초기 분석`);
      const analysis = await withOperationTimeout(
        analyzeUploadedFilesWithProvider(provider, {
          files,
          evaluationContext,
          evaluationItems,
        }),
        resolveInitialProviderTimeout(provider),
        `${label} 초기 분석`,
      );
      return { provider, analysis } satisfies ProviderAnalysisEntry;
    }),
  );

  const initialSuccesses: ProviderAnalysisEntry[] = [];
  const initialByProvider: Partial<Record<AiProviderId, UploadAnalysisResult>> = {};

  for (let index = 0; index < initialResults.length; index += 1) {
    const result = initialResults[index]!;
    const provider = providers[index]!;

    if (result.status === "fulfilled") {
      initialSuccesses.push(result.value);
      initialByProvider[result.value.provider] = result.value.analysis;
      continue;
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    warnings.push(
      `${formatProviderBadgeLabel(provider)} 초기 분석 실패: ${message} (종합 평가에서 제외됨)`,
    );
  }

  const missingProviders = providers.filter(
    (provider) => !initialSuccesses.some((entry) => entry.provider === provider),
  );
  if (missingProviders.length > 0) {
    warnings.push(
      `${missingProviders.map((provider) => formatProviderBadgeLabel(provider)).join(", ")} 엔진은 초기 분석에 참여하지 못했습니다. 아래 분석 참고 사항을 확인해 주세요.`,
    );
  }

  if (initialSuccesses.length === 0) {
    throw new AiAnalysisError(
      `모든 AI 엔진 분석에 실패했습니다. ${warnings.slice(-3).join(" / ")}`,
    );
  }

  if (initialSuccesses.length === 1) {
    const only = initialSuccesses[0]!;
    warnings.push(
      `${formatProviderBadgeLabel(only.provider)}만 성공해 상호 피드백 단계를 생략했습니다.`,
    );
    return {
      consensus: {
        ...only.analysis,
        warnings: [...(only.analysis.warnings ?? []), ...warnings],
      },
      initialByProvider,
      crossFeedbackByProvider: {},
      providersUsed: [only.provider],
      warnings,
    };
  }

  const remainingAfterInitial = getRemainingBudgetMs?.() ?? ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS;
  const arbiterProvider = resolveArbiterProvider(initialSuccesses.map((entry) => entry.provider));

  if (!arbiterProvider || remainingAfterInitial < ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS) {
    warnings.push(
      remainingAfterInitial < ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS
        ? "남은 분석 시간이 부족해 상호 검토 단계를 생략하고 초기 분석 합의(중앙값)로 종합했습니다."
        : "중재 엔진을 찾지 못해 초기 분석 합의(중앙값)로 종합했습니다.",
    );
    onAnalysisProgress?.("3단계: AI 합의 점수 산출(초기 분석)");
    const consensus = mergeConsensusAnalysis({
      analyses: initialSuccesses,
      items: evaluationItems,
      providersUsed: initialSuccesses.map((entry) => entry.provider),
    });
    consensus.warnings = [...warnings, ...(consensus.warnings ?? [])];
    return {
      consensus,
      initialByProvider,
      crossFeedbackByProvider: {},
      providersUsed: initialSuccesses.map((entry) => entry.provider),
      warnings,
    };
  }

  const arbiterTimeout = Math.min(
    ENSEMBLE_ARBITER_TIMEOUT_MS,
    Math.max(45_000, remainingAfterInitial - 10_000),
  );

  onAnalysisProgress?.(`2단계: ${formatProviderBadgeLabel(arbiterProvider)} 중재·상호 검토 합성`);
  let arbiterAnalysis: UploadAnalysisResult | null = null;

  try {
    const revised = await withOperationTimeout(
      analyzeUploadedFilesWithProvider(arbiterProvider, {
        files,
        evaluationContext,
        evaluationItems,
        promptOptions: {
          compact: true,
          evaluationOnly: true,
          includeVision: false,
          userPromptOverride: buildArbiterSynthesisPrompt({
            arbiterProvider,
            providerAnalyses: initialSuccesses,
            files,
            context: evaluationContext,
            items: evaluationItems,
          }),
        },
      }),
      arbiterTimeout,
      `${formatProviderBadgeLabel(arbiterProvider)} 중재 합성`,
    );
    arbiterAnalysis = revised;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`상호 검토 합성 실패: ${message}`);
  }

  const crossFeedbackByProvider: Partial<Record<AiProviderId, UploadAnalysisResult>> = {};
  if (arbiterAnalysis) {
    crossFeedbackByProvider[arbiterProvider] = arbiterAnalysis;
  }

  onAnalysisProgress?.("3단계: AI 합의 점수 확정");
  const consensus = arbiterAnalysis
    ? {
        ...arbiterAnalysis,
        provider: "ensemble" as const,
        warnings: [
          ...warnings,
          ...(arbiterAnalysis.warnings ?? []),
          `${formatProviderBadgeLabel(arbiterProvider)}가 ${initialSuccesses.length}개 엔진 초기 분석을 교차 검토해 종합 평가를 확정했습니다.`,
        ],
      }
    : mergeConsensusAnalysis({
        analyses: initialSuccesses,
        items: evaluationItems,
        providersUsed: initialSuccesses.map((entry) => entry.provider),
      });

  if (!arbiterAnalysis) {
    consensus.warnings = [...warnings, ...(consensus.warnings ?? [])];
  }

  return {
    consensus,
    initialByProvider,
    crossFeedbackByProvider,
    providersUsed: initialSuccesses.map((entry) => entry.provider),
    warnings,
  };
}
