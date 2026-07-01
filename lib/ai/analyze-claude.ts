import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import type { AnalysisPromptOptions } from "./analysis-prompt-options";
import { AiAnalysisError } from "./analysis-error";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { buildClaudeUserBlocks } from "./multimodal-payload";
import { AI_EVALUATOR_SYSTEM_PROMPT } from "./evaluator-system-prompt";
import { getClaudeModelsToTry } from "./claude-models";
import { getClaudeApiKey, getClaudeModel } from "./env-keys";
import { extractJsonContent } from "./extract-json";
import { fetchWithTimeout } from "../fetch-with-timeout";
import { formatProviderApiError } from "./format-api-error";
import {
  CLAUDE_ANALYSIS_MAX_OUTPUT_TOKENS,
  CLAUDE_VISION_ANALYSIS_MAX_OUTPUT_TOKENS,
} from "./output-token-limits";
import { isRetryableProviderError, retryDelayMs } from "./retryable-api-error";
import {
  buildAnthropicHeaders,
  filesIncludePdfVision,
  isClaudePayloadOrContextError,
  resolveClaudeFetchTimeoutMs,
  resolveClaudeVisionModes,
} from "./anthropic-request";

type ClaudeDeps = {
  normalizeAiJson: (content: string | undefined, items: EvaluationItem[]) => UploadAnalysisResult;
};

type ClaudeVisionMode = "vision" | "text-only";

export async function analyzeWithClaude(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  deps: ClaudeDeps,
  promptOptions?: AnalysisPromptOptions,
): Promise<UploadAnalysisResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    throw new AiAnalysisError(
      "CLAUDE_API_KEY가 서버에서 읽히지 않습니다. Vercel Environment Variables에 sk-ant- 키를 넣었는지 확인하고 재배포해 주세요.",
      "claude",
    );
  }

  if (!apiKey.startsWith("sk-ant-")) {
    throw new AiAnalysisError(
      "CLAUDE_API_KEY 형식이 올바르지 않습니다. Anthropic 콘솔에서 발급한 sk-ant- 로 시작하는 키인지 확인해 주세요.",
      "claude",
    );
  }

  const modelsToTry = getClaudeModelsToTry(getClaudeModel());
  const visionModes = resolveClaudeVisionModes(files, promptOptions);
  let lastStatus = 500;
  let lastBody = "";

  for (const model of modelsToTry) {
    for (const visionMode of visionModes) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let response: Response;
        try {
          response = await requestClaude(
            apiKey,
            model,
            files,
            evaluationContext,
            items,
            promptOptions,
            visionMode,
          );
        } catch (error) {
          if (error instanceof Error && error.message.includes("초과했습니다")) {
            const timeoutSeconds = Math.round(
              resolveClaudeFetchTimeoutMs(visionMode === "vision", promptOptions?.batchCount) / 1000,
            );
            throw new AiAnalysisError(
              `Claude 응답이 ${timeoutSeconds}초 안에 오지 않았습니다. 평가 항목이 많거나 PDF가 크면 Gemini 사용을 권장합니다.`,
              "claude",
            );
          }
          throw error;
        }

        if (response.ok) {
          const payload = (await response.json()) as {
            content?: Array<{ type?: string; text?: string }>;
            stop_reason?: string;
          };
          if (payload.stop_reason === "max_tokens") {
            throw new AiAnalysisError(
              "Claude 출력이 길이 제한에 걸려 JSON 응답이 잘렸습니다. 잠시 후 다시 시도하거나 ChatGPT를 사용해 주세요.",
              "claude",
            );
          }

          const textBlock = payload.content?.find((block) => block.type === "text") ?? payload.content?.[0];
          const content = extractJsonContent(textBlock?.text);
          return deps.normalizeAiJson(content, items);
        }

        lastStatus = response.status;
        lastBody = await response.text();

        if (response.status === 404) {
          break;
        }

        if (isClaudePayloadOrContextError(response.status, lastBody) && visionMode === "vision") {
          break;
        }

        if (isRetryableProviderError(response.status, lastBody) && attempt < 2) {
          await sleep(retryDelayMs(attempt));
          continue;
        }

        break;
      }

      if (lastStatus === 404) {
        break;
      }

      if (isClaudePayloadOrContextError(lastStatus, lastBody) && visionMode === "vision") {
        continue;
      }

      if (lastStatus !== 404) {
        break;
      }
    }

    if (lastStatus === 404) {
      continue;
    }
  }

  throw new AiAnalysisError(
    formatProviderApiError("claude", "Claude", lastStatus, lastBody, modelsToTry),
    "claude",
  );
}

async function requestClaude(
  apiKey: string,
  model: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  promptOptions: AnalysisPromptOptions | undefined,
  visionMode: ClaudeVisionMode,
) {
  const includeVision = visionMode === "vision";
  const promptText = buildAnalysisPrompt(files, evaluationContext, items, promptOptions);
  const content = buildClaudeUserBlocks(files, promptText, { includeVision });
  const includesPdf = includeVision && filesIncludePdfVision(files);
  const maxTokens = includeVision
    ? CLAUDE_VISION_ANALYSIS_MAX_OUTPUT_TOKENS
    : CLAUDE_ANALYSIS_MAX_OUTPUT_TOKENS;

  return fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: buildAnthropicHeaders({ apiKey, includesPdf }),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: `${AI_EVALUATOR_SYSTEM_PROMPT}\n\n반드시 유효한 JSON 객체 하나만 반환하라. 마크다운 코드블록 없이 JSON만 출력하라.`,
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    },
    resolveClaudeFetchTimeoutMs(includeVision, promptOptions?.batchCount),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
