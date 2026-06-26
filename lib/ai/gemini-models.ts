export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

const geminiModelFallbacks = [
  DEFAULT_GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-flash-latest",
] as const;

export function getGeminiModelsToTry(configuredModel?: string): string[] {
  const models = configuredModel?.trim()
    ? [configuredModel.trim(), ...geminiModelFallbacks]
    : [...geminiModelFallbacks];

  return Array.from(new Set(models));
}
