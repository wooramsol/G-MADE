import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import { AiAnalysisError } from "./analysis-error";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { AI_EVALUATOR_SYSTEM_PROMPT } from "./evaluator-system-prompt";
import { getClaudeModelsToTry } from "./claude-models";
import { getClaudeApiKey, getClaudeModel } from "./env-keys";
import { extractJsonContent } from "./extract-json";
import { fetchWithTimeout } from "../fetch-with-timeout";
import { formatProviderApiError } from "./format-api-error";

type ClaudeDeps = {
  normalizeAiJson: (content: string | undefined) => UploadAnalysisResult;
};

export async function analyzeWithClaude(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  deps: ClaudeDeps,
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
  let lastStatus = 500;
  let lastBody = "";

  for (const model of modelsToTry) {
    const response = await requestClaude(apiKey, model, files, evaluationContext, items);

    if (response.ok) {
      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const textBlock = payload.content?.find((block) => block.type === "text") ?? payload.content?.[0];
      const content = extractJsonContent(textBlock?.text);
      return deps.normalizeAiJson(content);
    }

    lastStatus = response.status;
    lastBody = await response.text();

    if (response.status === 404) {
      continue;
    }

    break;
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
) {
  return fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      system: AI_EVALUATOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildAnalysisPrompt(files, evaluationContext, items),
        },
      ],
    }),
  });
}
