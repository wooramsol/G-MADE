import type { AiProviderPreference } from "./ai/types";

export function resolveProviderDisplayLabel(provider?: string | null): string {
  if (provider === "gemini") return "Gemini";
  if (provider === "claude") return "Claude";
  if (provider === "openai") return "ChatGPT";
  return "AI";
}

export function formatInterruptedStreamMessage(provider?: AiProviderPreference | string | null): string {
  const label = resolveProviderDisplayLabel(provider);
  return `분석이 서버에서 중단되었습니다. ${label} 분석은 PDF 용량·평가 항목 수에 따라 최대 5분까지 걸릴 수 있습니다. 잠시 후 다시 시도하거나 마이페이지 연결 테스트를 확인해 주세요.`;
}

export const EVALUATION_SERVER_DEADLINE_MS = 285_000;

export const EVALUATION_SERVER_DEADLINE_MESSAGE =
  "서버 분석 시간 한도(약 5분)를 초과했습니다. 평가 항목을 줄이거나 PDF를 나눠 다시 시도해 주세요.";
