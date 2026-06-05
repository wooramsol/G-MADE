export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

const geminiModelFallbacks = [
  DEFAULT_GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash-001",
] as const;

export function getGeminiModelsToTry(configuredModel?: string): string[] {
  const models = configuredModel?.trim()
    ? [configuredModel.trim(), ...geminiModelFallbacks]
    : [...geminiModelFallbacks];

  return Array.from(new Set(models));
}
