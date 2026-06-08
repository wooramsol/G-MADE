type ParsedApiError = {
  code?: number;
  message?: string;
};

export type ProviderErrorKind = "gemini" | "claude" | "openai";

function parseApiErrorBody(body: string): ParsedApiError {
  try {
    const parsed = JSON.parse(body) as { error?: ParsedApiError };
    return parsed.error ?? {};
  } catch {
    return { message: body };
  }
}

function formatNotFoundMessage(kind: ProviderErrorKind, providerLabel: string): string {
  if (kind === "claude") {
    return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 CLAUDE_MODEL을 claude-sonnet-4-6으로 설정하거나 CLAUDE_MODEL 변수를 삭제한 뒤 재배포해 주세요. (claude-sonnet-4-20250514 등 구형 ID는 종료될 수 있습니다.)`;
  }

  if (kind === "openai") {
    return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 OPENAI_MODEL을 gpt-4o-mini로 설정하거나 OPENAI_MODEL 변수를 삭제한 뒤 재배포해 주세요.`;
  }

  return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 GEMINI_MODEL을 gemini-2.5-flash-lite로 설정하거나 GEMINI_MODEL 변수를 삭제한 뒤 재배포해 주세요. (gemini-2.0 계열은 2026년 6월부터 종료되었습니다.)`;
}

export function formatProviderApiError(
  kind: ProviderErrorKind,
  providerLabel: string,
  status: number,
  body: string,
): string {
  const parsed = parseApiErrorBody(body);
  const message = parsed.message ?? body;
  const code = parsed.code ?? status;
  const lowerMessage = message.toLowerCase();

  if (code === 429 || status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate")) {
    return `${providerLabel} 분당 요청 제한(RPM)에 걸렸습니다(429). 무료/유료 티어 한도에 걸릴 수 있습니다. 1~2분 후 한 번만 다시 시도해 주세요. 지금은 데모 분석 결과를 표시합니다.`;
  }

  if (code === 404 || status === 404 || lowerMessage.includes("not found")) {
    return formatNotFoundMessage(kind, providerLabel);
  }

  if (code === 401 || status === 401 || lowerMessage.includes("api key")) {
    return `${providerLabel} API 키가 올바르지 않습니다. Vercel의 API 키 설정을 확인해 주세요.`;
  }

  return `${providerLabel} API 호출 실패: ${message.slice(0, 220)}`;
}
