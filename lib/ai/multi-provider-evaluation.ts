import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import { AiAnalysisError } from "./analysis-error";
import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import { buildCrossFeedbackPrompt } from "./cross-feedback-prompt";
import { mergeConsensusAnalysis } from "./consensus-merge";
import { formatProviderBadgeLabel } from "./provider-labels";
import { getConfiguredLiveProviders } from "./select-provider";
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
}): Promise<MultiProviderEvaluationResult> {
  const { files, evaluationContext, evaluationItems, onAnalysisProgress } = input;
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

  onAnalysisProgress?.(`1단계: ${providers.length}개 AI 엔진 병렬 분석`);
  const initialResults = await Promise.allSettled(
    providers.map(async (provider) => {
      onAnalysisProgress?.(`${formatProviderBadgeLabel(provider)} 초기 분석`);
      const analysis = await analyzeUploadedFilesWithProvider(provider, {
        files,
        evaluationContext,
        evaluationItems,
      });
      return { provider, analysis } satisfies ProviderAnalysisEntry;
    }),
  );

  const initialSuccesses: ProviderAnalysisEntry[] = [];
  const initialByProvider: Partial<Record<AiProviderId, UploadAnalysisResult>> = {};

  for (const result of initialResults) {
    if (result.status === "fulfilled") {
      initialSuccesses.push(result.value);
      initialByProvider[result.value.provider] = result.value.analysis;
      continue;
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    warnings.push(`초기 분석 실패: ${message}`);
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

  onAnalysisProgress?.("2단계: AI 상호 피드백·교차 검토");
  const crossFeedbackResults = await Promise.allSettled(
    initialSuccesses.map(async (entry) => {
      const peers = initialSuccesses.filter((peer) => peer.provider !== entry.provider);
      const prompt = buildCrossFeedbackPrompt({
        selfProvider: entry.provider,
        selfAnalysis: entry.analysis,
        peerAnalyses: peers,
        files,
        context: evaluationContext,
        items: evaluationItems,
      });

      onAnalysisProgress?.(`${formatProviderBadgeLabel(entry.provider)} 상호 검토`);
      const revised = await analyzeUploadedFilesWithProvider(entry.provider, {
        files,
        evaluationContext,
        evaluationItems,
        promptOptions: {
          compact: true,
          evaluationOnly: true,
          includeVision: false,
          userPromptOverride: prompt,
        },
      });

      return { provider: entry.provider, analysis: revised } satisfies ProviderAnalysisEntry;
    }),
  );

  const crossFeedbackSuccesses: ProviderAnalysisEntry[] = [];
  const crossFeedbackByProvider: Partial<Record<AiProviderId, UploadAnalysisResult>> = {};

  for (const result of crossFeedbackResults) {
    if (result.status === "fulfilled") {
      crossFeedbackSuccesses.push(result.value);
      crossFeedbackByProvider[result.value.provider] = result.value.analysis;
      continue;
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    warnings.push(`상호 피드백 실패: ${message}`);
  }

  const mergeSource =
    crossFeedbackSuccesses.length > 0 ? crossFeedbackSuccesses : initialSuccesses;

  onAnalysisProgress?.("3단계: AI 합의 점수 산출");
  const consensus = mergeConsensusAnalysis({
    analyses: mergeSource,
    items: evaluationItems,
    providersUsed: mergeSource.map((entry) => entry.provider),
  });

  consensus.warnings = [...warnings, ...(consensus.warnings ?? [])];

  return {
    consensus,
    initialByProvider,
    crossFeedbackByProvider,
    providersUsed: initialSuccesses.map((entry) => entry.provider),
    warnings,
  };
}
