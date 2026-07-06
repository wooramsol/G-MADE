import { getClaudeApiKey, getGeminiApiKey, getOpenAiApiKey } from "./env-keys";
import type { AiProviderId, AiProviderPreference } from "./types";

const providerOrder: AiProviderId[] = ["gemini", "openai", "claude"];

export function getDefaultAiProvider(): AiProviderId | null {
  const configured = process.env.AI_PROVIDER_DEFAULT?.trim().toLowerCase();

  if (configured === "gemini" || configured === "openai" || configured === "claude") {
    return isProviderConfigured(configured) ? configured : null;
  }

  return "gemini";
}

export function selectProvider(preference: AiProviderPreference): AiProviderId | null {
  if (preference === "ensemble") {
    return null;
  }

  if (preference !== "auto") {
    return isProviderConfigured(preference) ? preference : null;
  }

  const preferred = getDefaultAiProvider();
  if (preferred && isProviderConfigured(preferred)) {
    return preferred;
  }

  for (const provider of providerOrder) {
    if (isProviderConfigured(provider)) {
      return provider;
    }
  }

  return null;
}

export function isProviderConfigured(provider: AiProviderId): boolean {
  if (provider === "openai") return Boolean(getOpenAiApiKey());
  if (provider === "gemini") return Boolean(getGeminiApiKey());
  if (provider === "claude") return Boolean(getClaudeApiKey());
  return false;
}

export function getConfiguredLiveProviders(): AiProviderId[] {
  return providerOrder.filter((provider) => isProviderConfigured(provider));
}

/** 종합 평가 중재(상호 검토 합성)에 사용할 엔진 — 성공한 후보 중 우선순위 적용 */
export function resolveArbiterProvider(candidates: AiProviderId[]): AiProviderId | null {
  const arbiterOrder: AiProviderId[] = ["gemini", "claude", "openai"];
  for (const provider of arbiterOrder) {
    if (candidates.includes(provider)) return provider;
  }
  return candidates[0] ?? null;
}

export function getActiveProviderLabel(preference: AiProviderPreference = "auto"): string {
  const provider = selectProvider(preference);
  if (!provider) return "미설정";

  const labels: Record<AiProviderId, string> = {
    gemini: "Gemini",
    openai: "ChatGPT",
    claude: "Claude",
  };

  return labels[provider];
}
