import { AiAnalysisError } from "@/lib/ai/analysis-error";
import {
  buildAnthropicHeaders,
  isClaudePayloadOrContextError,
} from "@/lib/ai/anthropic-request";
import { getClaudeModelsToTry } from "@/lib/ai/claude-models";
import { getClaudeApiKey, getClaudeModel } from "@/lib/ai/env-keys";
import { formatProviderApiError } from "@/lib/ai/format-api-error";
import { isRetryableProviderError, retryDelayMs } from "@/lib/ai/retryable-api-error";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export type ClaudeContentBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
      cache_control?: { type: "ephemeral" };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
      title?: string;
      cache_control?: { type: "ephemeral" };
    };

export type ClaudeCallOptions = {
  system: string;
  userBlocks: ClaudeContentBlock[];
  maxOutputTokens: number;
  /** true면 지정 모델만 사용 (기본: 환경변수 모델 → 기본 모델 순서로 시도) */
  model?: string;
  includesPdf?: boolean;
  timeoutMs?: number;
  /** 기본 0 — 같은 문서에 같은 판정이 나오도록 결정적 출력 사용 */
  temperature?: number;
};

export type ClaudeCallResult = {
  text: string;
  model: string;
  stopReason?: string;
};

export function isClaudeConfigured(): boolean {
  return Boolean(getClaudeApiKey());
}

/** Anthropic Messages API 단건 호출 (모델 폴백 + 일시 오류 재시도). */
export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    throw new AiAnalysisError(
      "CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요.",
      "claude",
    );
  }

  const models = options.model ? [options.model] : getClaudeModelsToTry(getClaudeModel());
  const triedModels: string[] = [];
  let lastError: Error | null = null;

  for (const model of models) {
    triedModels.push(model);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          ANTHROPIC_MESSAGES_URL,
          {
            method: "POST",
            headers: buildAnthropicHeaders({ apiKey, includesPdf: options.includesPdf }),
            body: JSON.stringify({
              model,
              max_tokens: options.maxOutputTokens,
              temperature: options.temperature ?? 0,
              system: options.system,
              messages: [{ role: "user", content: options.userBlocks }],
            }),
          },
          options.timeoutMs ?? 240_000,
        );

        if (!response.ok) {
          const body = await response.text();

          if (isRetryableProviderError(response.status, body) && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
            continue;
          }

          const message = formatProviderApiError("claude", "Claude", response.status, body, triedModels);

          // 모델 없음 → 다음 후보 모델로 폴백
          if (response.status === 404) {
            lastError = new AiAnalysisError(message, "claude");
            break;
          }

          if (isClaudePayloadOrContextError(response.status, body)) {
            throw new ClaudePayloadTooLargeError(message);
          }

          throw new AiAnalysisError(message, "claude");
        }

        const payload = (await response.json()) as {
          content?: Array<{ type: string; text?: string }>;
          stop_reason?: string;
        };
        const text = (payload.content ?? [])
          .filter((block) => block.type === "text" && block.text)
          .map((block) => block.text)
          .join("\n")
          .trim();

        if (!text) {
          throw new AiAnalysisError("Claude 응답이 비어 있습니다.", "claude");
        }

        return { text, model, stopReason: payload.stop_reason };
      } catch (error) {
        if (error instanceof ClaudePayloadTooLargeError || error instanceof AiAnalysisError) {
          throw error;
        }

        // 네트워크/타임아웃 — 1회 재시도
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
          continue;
        }
      }
    }
  }

  throw new AiAnalysisError(
    lastError?.message ?? "Claude API 호출에 실패했습니다.",
    "claude",
  );
}

/** 입력(문서·컨텍스트) 용량 초과 — 텍스트 전용 재시도 등 폴백 판단에 사용. */
export class ClaudePayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudePayloadTooLargeError";
  }
}
