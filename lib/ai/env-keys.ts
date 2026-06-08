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

export function getClaudeApiKey(): string | undefined {
  return readEnv("CLAUDE_API_KEY") ?? readEnv("ANTHROPIC_API_KEY");
}

export function getClaudeModel(): string | undefined {
  return readEnv("CLAUDE_MODEL") ?? readEnv("ANTHROPIC_MODEL");
}

export function getConfiguredProviders() {
  const gemini = Boolean(getGeminiApiKey());
  const openai = Boolean(getOpenAiApiKey());
  const claude = Boolean(getClaudeApiKey());

  return {
    gemini,
    openai,
    claude,
    claudeKeyHint: claude ? getClaudeApiKey()?.slice(0, 7) : null,
    claudeEnvKey: claude
      ? readEnv("CLAUDE_API_KEY")
        ? "CLAUDE_API_KEY"
        : "ANTHROPIC_API_KEY"
      : null,
    geminiKeyHint: gemini ? getGeminiApiKey()?.slice(0, 4) : null,
    openaiKeyHint: openai ? getOpenAiApiKey()?.slice(0, 3) : null,
  };
}
