export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

const claudeModelFallbacks = [
  DEFAULT_CLAUDE_MODEL,
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-20250514",
] as const;

export function getClaudeModelsToTry(configuredModel?: string): string[] {
  const models = configuredModel?.trim()
    ? [configuredModel.trim(), ...claudeModelFallbacks]
    : [...claudeModelFallbacks];

  return Array.from(new Set(models));
}
