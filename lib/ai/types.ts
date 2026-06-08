export type AiProviderId = "demo" | "openai" | "gemini" | "claude";

export type AiProviderPreference = "auto" | AiProviderId;

export type LiveAiProviderId = Exclude<AiProviderId, "demo">;
