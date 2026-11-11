export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

/** 빠른 보조 모델(항목 추출·수치 추출·도면 글자 판독) — CLAUDE_FAST_MODEL 환경변수로 교체 가능 */
export const CLAUDE_FAST_MODEL = process.env.CLAUDE_FAST_MODEL?.trim() || "claude-haiku-4-5";

/**
 * 5세대 이후 모델(예: claude-sonnet-5-5, claude-haiku-5-5)은 항상 "생각(thinking)"을 하고
 * 그 분량이 출력 한도에 포함되며, temperature 대신 effort로 깊이를 조절한다.
 * 모델을 바꿀 때 요청 형식이 자동으로 맞춰지도록 여기서 판별한다.
 */
export function isAdaptiveThinkingModel(model: string): boolean {
  return /^claude-(sonnet|haiku|opus|fable|mythos)-(5|[6-9])(-|$)/.test(model.trim());
}

const claudeModelFallbacks = [
  DEFAULT_CLAUDE_MODEL,
  CLAUDE_FAST_MODEL,
  "claude-sonnet-4-5",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
] as const;

export function getClaudeModelsToTry(configuredModel?: string): string[] {
  const models = configuredModel?.trim()
    ? [configuredModel.trim(), ...claudeModelFallbacks]
    : [...claudeModelFallbacks];

  return Array.from(new Set(models));
}
