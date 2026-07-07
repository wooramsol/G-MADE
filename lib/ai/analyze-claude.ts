import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import type { AnalysisPromptOptions } from "./analysis-prompt-options";
import { prepareFilesForClaudeAnalysis } from "./claude-analysis-prep";
import { CLAUDE_FAST_MODEL } from "./claude-models";
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
  CLAUDE_FAST_RETRY_MAX_OUTPUT_TOKENS,
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

type ClaudeRequestProfile = {
  model: string;
  files: UploadedFileSummary[];
  promptOptions?: AnalysisPromptOptions;
  visionMode: ClaudeVisionMode;
  maxTokens: number;
  timeoutMs: number;
};

function isClaudeFetchTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("초과했습니다");
}

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

  const prepared = prepareFilesForClaudeAnalysis(files);
  const modelsToTry = getClaudeModelsToTry(getClaudeModel());
  const visionModes = resolveClaudeVisionModes(prepared.files, promptOptions);
  const profiles = buildClaudeRequestProfiles(modelsToTry, prepared.files, promptOptions, visionModes, items.length);

  let lastStatus = 500;
  let lastBody = "";
  let lastTimeoutSeconds = 0;

  for (const profile of profiles) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await requestClaude(apiKey, evaluationContext, items, profile);
      } catch (error) {
        if (isClaudeFetchTimeoutError(error)) {
          lastTimeoutSeconds = Math.round(profile.timeoutMs / 1000);
          break;
        }
        throw error;
      }

      if (response.ok) {
        const payload = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
          stop_reason?: string;
        };
        if (payload.stop_reason === "max_tokens") {
          break;
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

      if (isClaudePayloadOrContextError(response.status, lastBody) && profile.visionMode === "vision") {
        break;
      }

      if (isRetryableProviderError(response.status, lastBody) && attempt < 2) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      break;
    }

    if (lastStatus === 404) {
      continue;
    }

    if (lastTimeoutSeconds > 0) {
      continue;
    }

    if (isClaudePayloadOrContextError(lastStatus, lastBody) && profile.visionMode === "vision") {
      continue;
    }

    if (lastStatus !== 404) {
      break;
    }
  }

  if (lastTimeoutSeconds > 0) {
    throw new AiAnalysisError(
      `Claude 응답이 ${lastTimeoutSeconds}초 안에 오지 않았습니다. 자료가 크거나 항목이 많으면 Gemini 사용을 권장합니다.`,
      "claude",
    );
  }

  throw new AiAnalysisError(
    formatProviderApiError("claude", "Claude", lastStatus, lastBody, modelsToTry),
    "claude",
  );
}

function buildClaudeRequestProfiles(
  modelsToTry: string[],
  files: UploadedFileSummary[],
  promptOptions: AnalysisPromptOptions | undefined,
  visionModes: ClaudeVisionMode[],
  itemCount: number,
): ClaudeRequestProfile[] {
  if (promptOptions?.ensembleFast) {
    return [
      {
        model: CLAUDE_FAST_MODEL,
        files: prepareFilesForClaudeAnalysis(files, 14_000).files,
        promptOptions: { compact: true, includeVision: false, ensembleFast: true },
        visionMode: "text-only",
        maxTokens: CLAUDE_FAST_RETRY_MAX_OUTPUT_TOKENS,
        timeoutMs: 90_000,
      },
    ];
  }

  const profiles: ClaudeRequestProfile[] = [];
  const compact = promptOptions?.compact === true || itemCount > 4;
  const mergedPromptOptions: AnalysisPromptOptions = {
    ...promptOptions,
    compact,
  };

  for (const model of modelsToTry) {
    for (const visionMode of visionModes) {
      const includeVision = visionMode === "vision";
      profiles.push({
        model,
        files,
        promptOptions: mergedPromptOptions,
        visionMode,
        maxTokens: includeVision ? CLAUDE_VISION_ANALYSIS_MAX_OUTPUT_TOKENS : CLAUDE_ANALYSIS_MAX_OUTPUT_TOKENS,
        timeoutMs: resolveClaudeFetchTimeoutMs(includeVision, promptOptions?.batchCount),
      });
    }
  }

  profiles.push({
    model: CLAUDE_FAST_MODEL,
    files: prepareFilesForClaudeAnalysis(files, 14_000).files,
    promptOptions: { ...mergedPromptOptions, compact: true, includeVision: false },
    visionMode: "text-only",
    maxTokens: CLAUDE_FAST_RETRY_MAX_OUTPUT_TOKENS,
    timeoutMs: 120_000,
  });

  return profiles;
}

async function requestClaude(
  apiKey: string,
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  profile: ClaudeRequestProfile,
) {
  const includeVision = profile.visionMode === "vision";
  const promptText = buildAnalysisPrompt(profile.files, evaluationContext, items, profile.promptOptions);
  const content = buildClaudeUserBlocks(profile.files, promptText, { includeVision: includeVision });
  const includesPdf = includeVision && filesIncludePdfVision(profile.files);

  return fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: buildAnthropicHeaders({ apiKey, includesPdf }),
      body: JSON.stringify({
        model: profile.model,
        max_tokens: profile.maxTokens,
        system: `${AI_EVALUATOR_SYSTEM_PROMPT}\n\n반드시 유효한 JSON 객체 하나만 반환하라. 마크다운 코드블록 없이 JSON만 출력하라.`,
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    },
    profile.timeoutMs,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
