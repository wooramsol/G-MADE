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

export function getClaudeApiKey(): string | undefined {
  return readEnv("CLAUDE_API_KEY", "ANTHROPIC_API_KEY");
}

export function getClaudeModel(): string | undefined {
  return readEnv("CLAUDE_MODEL", "ANTHROPIC_MODEL");
}

export function getClaudeStatus() {
  const configured = Boolean(getClaudeApiKey());

  return {
    configured,
    envKey: configured
      ? sanitizeSecret(process.env.CLAUDE_API_KEY)
        ? "CLAUDE_API_KEY"
        : "ANTHROPIC_API_KEY"
      : null,
  };
}
