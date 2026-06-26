import type { AiProviderPreference } from "./ai/types";

const LIVE_PROVIDERS = new Set(["gemini", "openai", "claude"]);

/** 폼/API에서 받은 provider 값을 서버 기본값(AI_PROVIDER_DEFAULT)과 맞춥니다. */
export function resolveAiProviderPreference(raw?: string | null): AiProviderPreference {
  const value = raw?.trim().toLowerCase();

  if (value === "auto") {
    return "auto";
  }

  if (value && LIVE_PROVIDERS.has(value)) {
    return value as AiProviderPreference;
  }

  const defaultProvider = process.env.AI_PROVIDER_DEFAULT?.trim().toLowerCase();
  if (defaultProvider === "openai" || defaultProvider === "claude" || defaultProvider === "gemini") {
    return defaultProvider;
  }

  return "auto";
}

/** 클라이언트 AI 엔진 선택 초기값 */
export function toClientAiProviderPreference(
  defaultProvider: string,
): "gemini" | "openai" | "claude" {
  if (defaultProvider === "openai" || defaultProvider === "claude") {
    return defaultProvider;
  }
  return "gemini";
}
