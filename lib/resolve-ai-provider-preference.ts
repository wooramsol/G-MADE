import { getDefaultAiProvider } from "./ai/select-provider";
import type { AiProviderPreference } from "./ai/types";

const LIVE_PROVIDERS = new Set(["gemini", "openai", "claude"]);

/** 폼/API에서 받은 provider 값을 서버 기본값(AI_PROVIDER_DEFAULT)과 맞춥니다. */
export function resolveAiProviderPreference(raw?: string | null): AiProviderPreference {
  const value = raw?.trim().toLowerCase();

  if (value === "demo" || value === "auto") {
    return value;
  }

  if (value && LIVE_PROVIDERS.has(value)) {
    return value as AiProviderPreference;
  }

  const defaultProvider = getDefaultAiProvider();
  return defaultProvider === "demo" ? "auto" : defaultProvider;
}

/** 클라이언트 AI 엔진 선택 초기값 (demo/auto는 gemini로 표시). */
export function toClientAiProviderPreference(
  defaultProvider: string,
): "gemini" | "openai" | "claude" {
  if (defaultProvider === "openai" || defaultProvider === "claude") {
    return defaultProvider;
  }
  return "gemini";
}
