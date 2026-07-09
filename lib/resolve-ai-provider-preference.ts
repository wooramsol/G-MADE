import type { AiProviderPreference } from "./ai/types";

const LIVE_PROVIDERS = new Set(["gemini", "openai", "claude", "ensemble"]);

/** 폼/API에서 받은 provider 값을 서버 기본값(AI_PROVIDER_DEFAULT)과 맞춥니다. */
export function resolveAiProviderPreference(raw?: string | null): AiProviderPreference {
  const value = raw?.trim().toLowerCase();

  if (value === "auto" || value === "ensemble") {
    return value;
  }

  if (value && LIVE_PROVIDERS.has(value)) {
    return value as AiProviderPreference;
  }

  const defaultProvider = process.env.AI_PROVIDER_DEFAULT?.trim().toLowerCase();
  if (defaultProvider === "openai" || defaultProvider === "claude" || defaultProvider === "gemini") {
    return defaultProvider;
  }

  return "claude";
}

/** 클라이언트 AI 엔진 선택 초기값 — Claude로 통일 (PDF·도면 비전 분석 안정성 우선) */
export function toClientAiProviderPreference(
  _defaultProvider: string,
): "claude" {
  return "claude";
}
