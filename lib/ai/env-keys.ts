function sanitizeSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[\r\n]/g, "");

  return trimmed || undefined;
}

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = sanitizeSecret(process.env[name]);
    if (value) return value;
  }

  return undefined;
}

export function getGeminiApiKey(): string | undefined {
  return readEnv("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY");
}

export function getOpenAiApiKey(): string | undefined {
  return readEnv("OPENAI_API_KEY");
}

export function getClaudeApiKey(): string | undefined {
  return readEnv("CLAUDE_API_KEY", "ANTHROPIC_API_KEY");
}

export function getClaudeModel(): string | undefined {
  return readEnv("CLAUDE_MODEL", "ANTHROPIC_MODEL");
}

export function getGeminiModel(): string | undefined {
  return readEnv("GEMINI_MODEL");
}

export function getOpenAiModel(): string | undefined {
  return readEnv("OPENAI_MODEL");
}

export function getConfiguredProviders() {
  const gemini = Boolean(getGeminiApiKey());
  const openai = Boolean(getOpenAiApiKey());
  const claude = Boolean(getClaudeApiKey());

  return {
    gemini,
    openai,
    claude,
    claudeEnvKey: claude
      ? sanitizeSecret(process.env.CLAUDE_API_KEY)
        ? "CLAUDE_API_KEY"
        : "ANTHROPIC_API_KEY"
      : null,
    geminiEnvKey: gemini
      ? sanitizeSecret(process.env.GEMINI_API_KEY)
        ? "GEMINI_API_KEY"
        : sanitizeSecret(process.env.GOOGLE_API_KEY)
          ? "GOOGLE_API_KEY"
          : "GOOGLE_GENERATIVE_AI_API_KEY"
      : null,
  };
}
