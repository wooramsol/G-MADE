import { fetchWithTimeout } from "../fetch-with-timeout";
import { buildAnthropicHeaders } from "./anthropic-request";
import { getClaudeModelsToTry } from "./claude-models";
import { formatProviderApiError } from "./format-api-error";
import {
  getClaudeApiKey,
  getClaudeModel,
  getGeminiApiKey,
  getGeminiModel,
  getOpenAiApiKey,
  getOpenAiModel,
} from "./env-keys";
import { DEFAULT_GEMINI_MODEL, getGeminiModelsToTry } from "./gemini-models";
import { requestGeminiGenerateContent } from "./gemini-request";

export type ProviderProbeResult = {
  provider: "gemini" | "openai" | "claude";
  configured: boolean;
  reachable: boolean;
  message: string;
};

export async function probeConfiguredAiProviders(): Promise<ProviderProbeResult[]> {
  const probes: Promise<ProviderProbeResult>[] = [];

  if (getGeminiApiKey()) probes.push(probeGemini());
  if (getOpenAiApiKey()) probes.push(probeOpenAi());
  if (getClaudeApiKey()) probes.push(probeClaude());

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

  return Promise.all(probes);
}

async function probeGemini(): Promise<ProviderProbeResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      provider: "gemini",
      configured: false,
      reachable: false,
      message: "GEMINI_API_KEY가 설정되지 않았습니다.",
    };
  }

  const modelsToTry = getGeminiModelsToTry(getGeminiModel());
  let lastStatus = 500;
  let lastBody = "";

  for (const model of modelsToTry) {
    try {
      const response = await requestGeminiGenerateContent(
        apiKey,
        model,
        {
          contents: [{ parts: [{ text: 'Return JSON only: {"probe":true}' }] }],
          generationConfig: {
            maxOutputTokens: 32,
            temperature: 0,
            responseMimeType: "application/json",
          },
        },
        12_000,
      );

      if (response.ok) {
        const payload = await response.json();
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text?.includes("probe")) {
          return {
            provider: "gemini",
            configured: true,
            reachable: false,
            message: `Gemini 연결은 되었으나 JSON 분석 응답 형식이 기대와 다릅니다 (모델: ${model}). 실제 평가 시에도 실패할 수 있습니다.`,
          };
        }

        return {
          provider: "gemini",
          configured: true,
          reachable: true,
          message: `Gemini 연결·JSON 응답 확인 (모델: ${model}). 실제 문서 분석은 자료 크기에 따라 별도로 실패할 수 있습니다.`,
        };
      }

      lastStatus = response.status;
      lastBody = await response.text();

      if (response.status === 404) {
        continue;
      }

      break;
    } catch (error) {
      return {
        provider: "gemini",
        configured: true,
        reachable: false,
        message: error instanceof Error ? error.message : "Gemini API 연결에 실패했습니다.",
      };
    }
  }

  return {
    provider: "gemini",
    configured: true,
    reachable: false,
    message: formatProviderApiError("gemini", "Gemini", lastStatus, lastBody, modelsToTry),
  };
}

async function probeOpenAi(): Promise<ProviderProbeResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return {
      provider: "openai",
      configured: false,
      reachable: false,
      message: "OPENAI_API_KEY가 설정되지 않았습니다.",
    };
  }

  const model = getOpenAiModel() || "gpt-4o-mini";

  try {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 32,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: 'Return JSON: {"probe":true}' }],
        }),
      },
      12_000,
    );

    if (response.ok) {
      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content;
      if (!content?.includes("probe")) {
        return {
          provider: "openai",
          configured: true,
          reachable: false,
          message: `OpenAI 연결은 되었으나 JSON 분석 응답 형식이 기대와 다릅니다 (모델: ${model}).`,
        };
      }

      return {
        provider: "openai",
        configured: true,
        reachable: true,
        message: `OpenAI 연결·JSON 응답 확인 (모델: ${model}). 실제 문서 분석은 자료 크기에 따라 별도로 실패할 수 있습니다.`,
      };
    }

    const body = await response.text();
    return {
      provider: "openai",
      configured: true,
      reachable: false,
      message: formatProviderApiError("openai", "OpenAI", response.status, body, [model]),
    };
  } catch (error) {
    return {
      provider: "openai",
      configured: true,
      reachable: false,
      message: error instanceof Error ? error.message : "OpenAI API 연결에 실패했습니다.",
    };
  }
}

async function probeClaude(): Promise<ProviderProbeResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return {
      provider: "claude",
      configured: false,
      reachable: false,
      message: "CLAUDE_API_KEY가 설정되지 않았습니다.",
    };
  }

  if (!apiKey.startsWith("sk-ant-")) {
    return {
      provider: "claude",
      configured: true,
      reachable: false,
      message:
        "CLAUDE_API_KEY 형식이 올바르지 않습니다. Anthropic 콘솔에서 발급한 sk-ant- 로 시작하는 키인지 확인해 주세요.",
    };
  }

  const modelsToTry = getClaudeModelsToTry(getClaudeModel());
  let lastStatus = 500;
  let lastBody = "";

  for (const model of modelsToTry) {
    try {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: buildAnthropicHeaders({ apiKey }),
          body: JSON.stringify({
            model,
            max_tokens: 32,
            messages: [{ role: "user", content: 'Return JSON only: {"probe":true}' }],
          }),
        },
        12_000,
      );

      if (response.ok) {
        const payload = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const text = payload.content?.find((block) => block.type === "text")?.text ?? payload.content?.[0]?.text;
        if (!text?.includes("probe")) {
          return {
            provider: "claude",
            configured: true,
            reachable: false,
            message: `Claude 연결은 되었으나 JSON 분석 응답 형식이 기대와 다릅니다 (모델: ${model}).`,
          };
        }

        return {
          provider: "claude",
          configured: true,
          reachable: true,
          message: `Claude 연결·JSON 응답 확인 (모델: ${model}). 실제 문서 분석은 자료 크기에 따라 별도로 실패할 수 있습니다.`,
        };
      }

      lastStatus = response.status;
      lastBody = await response.text();

      if (response.status === 404) {
        continue;
      }

      break;
    } catch (error) {
      return {
        provider: "claude",
        configured: true,
        reachable: false,
        message: error instanceof Error ? error.message : "Claude API 연결에 실패했습니다.",
      };
    }
  }

  return {
    provider: "claude",
    configured: true,
    reachable: false,
    message: formatProviderApiError("claude", "Claude", lastStatus, lastBody, modelsToTry),
  };
}

export function getConfiguredModelSummary() {
  return {
    gemini: getGeminiModel() ?? DEFAULT_GEMINI_MODEL,
    openai: getOpenAiModel() ?? "gpt-4o-mini",
    claude: getClaudeModel() ?? "claude-sonnet-4-6",
  };
}
