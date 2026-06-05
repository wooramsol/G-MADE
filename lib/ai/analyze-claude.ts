import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { getClaudeApiKey, getClaudeModel } from "./env-keys";
import { extractJsonContent } from "./extract-json";
import { formatProviderApiError } from "./format-api-error";

type ClaudeDeps = {
  normalizeAiJson: (
    content: string | undefined,
    files: UploadedFileSummary[],
    provider: "claude",
  ) => UploadAnalysisResult;
  createDemoAnalysis: (
    files: UploadedFileSummary[],
    provider: "demo" | "claude",
    warnings: string[],
  ) => UploadAnalysisResult;
};

export async function analyzeWithClaude(
  files: UploadedFileSummary[],
  deps: ClaudeDeps,
): Promise<UploadAnalysisResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return deps.createDemoAnalysis(files, "claude", [
      "CLAUDE_API_KEY가 서버에서 읽히지 않습니다. Vercel Environment Variables에 sk-ant- 키를 넣었는지 확인하고 재배포해 주세요. /api/ai-status 로 등록 여부를 확인할 수 있습니다.",
    ]);
  }

  if (!apiKey.startsWith("sk-ant-")) {
    return deps.createDemoAnalysis(files, "claude", [
      "CLAUDE_API_KEY 형식이 올바르지 않습니다. sk-ant- 로 시작하는 Claude API 키인지 확인해 주세요.",
    ]);
  }

  const model = getClaudeModel();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system:
        "너는 G-MADE Hybrid Evaluation System의 경관사전심의 AI 평가 보조자다. 최종 결정권자는 인간 심사위원이다. 반드시 유효한 JSON 객체 하나만 반환한다. 설명 문장이나 마크다운 코드블록 없이 JSON만 출력한다.",
      messages: [
        {
          role: "user",
          content: buildAnalysisPrompt(files),
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    return deps.createDemoAnalysis(files, "claude", [formatProviderApiError("Claude", response.status, message)]);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textBlock = payload.content?.find((block) => block.type === "text") ?? payload.content?.[0];
  const content = extractJsonContent(textBlock?.text);

  return deps.normalizeAiJson(content, files, "claude");
}
