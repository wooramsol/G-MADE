import { fetchWithTimeout } from "../fetch-with-timeout";
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
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 8, temperature: 0 },
        },
        12_000,
      );

      if (response.ok) {
        return {
          provider: "gemini",
          configured: true,
          reachable: true,
          message: `Gemini API 응답 정상 (모델: ${model})`,
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
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      },
      12_000,
    );

    if (response.ok) {
      return {
        provider: "openai",
        configured: true,
        reachable: true,
        message: `OpenAI API 응답 정상 (모델: ${model})`,
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
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 8,
            messages: [{ role: "user", content: "ping" }],
          }),
        },
        12_000,
      );

      if (response.ok) {
        return {
          provider: "claude",
          configured: true,
          reachable: true,
          message: `Claude API 응답 정상 (모델: ${model})`,
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
