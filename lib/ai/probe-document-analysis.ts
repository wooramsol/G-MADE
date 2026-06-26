import { analyzeUploadedFiles } from "../upload-analysis";
import { isAiAnalysisError } from "./analysis-error";
import { isProviderConfigured } from "./select-provider";
import type { ProviderProbeResult } from "./probe-providers";
import {
  PROBE_EVALUATION_CONTEXT,
  PROBE_EVALUATION_ITEMS,
  PROBE_UPLOADED_FILES,
} from "./probe-analysis-fixtures";

const PROVIDERS = ["gemini", "openai", "claude"] as const;

/** 실제 평가와 동일한 프롬프트·JSON 스키마로 축소 심의 분석을 시험합니다. */
export async function probeDocumentAnalysisForProviders(): Promise<ProviderProbeResult[]> {
  const probes: ProviderProbeResult[] = [];

  for (const provider of PROVIDERS) {
    if (!isProviderConfigured(provider)) {
      continue;
    }

    try {
      const result = await analyzeUploadedFiles({
        providerPreference: provider,
        files: PROBE_UPLOADED_FILES,
        evaluationContext: PROBE_EVALUATION_CONTEXT,
        evaluationItems: PROBE_EVALUATION_ITEMS,
      });

      const itemCount = result.evaluationPreview.length;
      probes.push({
        provider,
        configured: true,
        reachable: itemCount > 0,
        message:
          itemCount > 0
            ? `${label(provider)} 심의 분석 시험 통과 (${itemCount}개 항목 JSON 응답 확인).`
            : `${label(provider)} 심의 분석 시험에서 평가 항목이 비어 있습니다.`,
      });
    } catch (error) {
      const message = isAiAnalysisError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : `${label(provider)} 심의 분석 시험에 실패했습니다.`;

      probes.push({
        provider,
        configured: true,
        reachable: false,
        message: `${label(provider)} 심의 분석 시험 실패: ${message}`,
      });
    }
  }

  if (probes.length === 0) {
    return [
      {
        provider: "gemini",
        configured: false,
        reachable: false,
        message:
          "설정된 AI API 키가 없습니다. Vercel Production 환경에 GEMINI_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY 중 하나를 추가한 뒤 Redeploy 해 주세요.",
      },
    ];
  }

  return probes;
}

function label(provider: (typeof PROVIDERS)[number]): string {
  if (provider === "openai") return "ChatGPT";
  if (provider === "gemini") return "Gemini";
  return "Claude";
}
