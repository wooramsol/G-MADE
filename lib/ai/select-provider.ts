import type { AiProviderId, AiProviderPreference } from "./types";

const providerOrder: AiProviderId[] = ["gemini", "openai", "claude"];

export function getDefaultAiProvider(): AiProviderId {
  const configured = process.env.AI_PROVIDER_DEFAULT?.trim().toLowerCase();

  if (configured === "gemini" || configured === "openai" || configured === "claude" || configured === "demo") {
    return configured;
  }

  return "gemini";
}

export function selectProvider(preference: AiProviderPreference): AiProviderId {
  if (preference === "demo") return "demo";
  if (preference !== "auto") {
    return isProviderConfigured(preference) ? preference : "demo";
  }

  const preferred = getDefaultAiProvider();
  if (preferred !== "demo" && isProviderConfigured(preferred)) {
    return preferred;
  }

  for (const provider of providerOrder) {
    if (isProviderConfigured(provider)) {
      return provider;
    }
  }

  return "demo";
}

export function isProviderConfigured(provider: AiProviderId): boolean {
  if (provider === "demo") return true;
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "claude") return Boolean(process.env.ANTHROPIC_API_KEY);
  return false;
}

export function getActiveProviderLabel(preference: AiProviderPreference = "auto"): string {
  const provider = selectProvider(preference);
  const labels: Record<AiProviderId, string> = {
    demo: "데모",
    gemini: "Gemini",
    openai: "GPT (OpenAI)",
    claude: "Claude",
  };

  return labels[provider];
}
