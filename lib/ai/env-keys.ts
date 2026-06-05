function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getGeminiApiKey(): string | undefined {
  return readEnv("GEMINI_API_KEY");
}

export function getOpenAiApiKey(): string | undefined {
  return readEnv("OPENAI_API_KEY");
}

export function getAnthropicApiKey(): string | undefined {
  return readEnv("ANTHROPIC_API_KEY");
}

export function getConfiguredProviders() {
  const gemini = Boolean(getGeminiApiKey());
  const openai = Boolean(getOpenAiApiKey());
  const claude = Boolean(getAnthropicApiKey());

  return {
    gemini,
    openai,
    claude,
    anthropicKeyHint: claude ? getAnthropicApiKey()?.slice(0, 7) : null,
    geminiKeyHint: gemini ? getGeminiApiKey()?.slice(0, 4) : null,
    openaiKeyHint: openai ? getOpenAiApiKey()?.slice(0, 3) : null,
  };
}
