type ParsedApiError = {
  code?: number;
  message?: string;
};

export type ProviderErrorKind = "gemini" | "claude" | "openai";

function parseApiErrorBody(body: string): ParsedApiError {
  try {
    const parsed = JSON.parse(body) as {
      error?: ParsedApiError & { message?: string };
      message?: string;
    };

    if (parsed.error?.message) {
      return {
        code: parsed.error.code,
        message: parsed.error.message,
      };
    }

    if (parsed.message) {
      return { message: parsed.message };
    }

    return parsed.error ?? {};
  } catch {
    return { message: body };
  }
}

function formatNotFoundMessage(
  kind: ProviderErrorKind,
  providerLabel: string,
  triedModels?: string[],
): string {
  const tried = triedModels?.length ? ` 시도한 모델: ${triedModels.join(", ")}.` : "";

  if (kind === "claude") {
    return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 CLAUDE_MODEL을 claude-sonnet-4-6으로 설정하거나 CLAUDE_MODEL 변수를 삭제한 뒤 재배포해 주세요.${tried}`;
  }

  if (kind === "openai") {
    return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 OPENAI_MODEL을 gpt-4o-mini로 설정하거나 OPENAI_MODEL 변수를 삭제한 뒤 재배포해 주세요.${tried}`;
  }

  return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 GEMINI_MODEL을 gemini-2.5-flash-lite로 설정하거나 GEMINI_MODEL 변수를 삭제한 뒤 재배포해 주세요. (gemini-2.0 계열은 2026년 6월부터 종료되었습니다.)${tried}`;
}

export function formatProviderApiError(
  kind: ProviderErrorKind,
  providerLabel: string,
  status: number,
  body: string,
  triedModels?: string[],
): string {
  const parsed = parseApiErrorBody(body);
  const message = parsed.message ?? body;
  const code = parsed.code ?? status;
  const lowerMessage = message.toLowerCase();

  if (code === 429 || status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate")) {
    if (lowerMessage.includes("high demand")) {
      return `${providerLabel} 서버 수요가 일시적으로 높습니다. 1~2분 후 다시 시도하거나 ChatGPT를 선택해 주세요.`;
    }
    return `${providerLabel} 분당 요청 제한(RPM)에 걸렸습니다(429). 무료/유료 티어 한도에 걸릴 수 있습니다. 1~2분 후 다시 시도해 주세요.`;
  }

  if (lowerMessage.includes("high demand") || lowerMessage.includes("try again later")) {
    return `${providerLabel} 서버 수요가 일시적으로 높습니다. 잠시 후 다시 시도하거나 ChatGPT를 선택해 주세요.`;
  }

  if (code === 404 || status === 404 || lowerMessage.includes("not found")) {
    return formatNotFoundMessage(kind, providerLabel, triedModels);
  }

  if (
    code === 401 ||
    status === 401 ||
    lowerMessage.includes("api key") ||
    lowerMessage.includes("invalid x-api-key") ||
    lowerMessage.includes("permission denied")
  ) {
    return `${providerLabel} API 키가 올바르지 않거나 Production 환경에 등록되지 않았습니다. Vercel Environment Variables에서 키 이름·값·환경(Production)을 확인한 뒤 Redeploy 해 주세요.`;
  }

  if (
    lowerMessage.includes("credit balance") ||
    lowerMessage.includes("billing") ||
    lowerMessage.includes("purchase credits")
  ) {
    return `${providerLabel} 계정 크레딧/결제 설정이 필요합니다. Anthropic/Google AI 콘솔에서 사용 한도와 결제 상태를 확인해 주세요.`;
  }

  if (
    code === 413 ||
    status === 413 ||
    lowerMessage.includes("context length") ||
    lowerMessage.includes("token") ||
    lowerMessage.includes("too large") ||
    lowerMessage.includes("payload") ||
    lowerMessage.includes("resource exhausted") ||
    lowerMessage.includes("request too large")
  ) {
    return `${providerLabel} 입력 분량이 너무 큽니다. 대용량 PDF는 일부만 분석에 사용됩니다. 같은 오류가 반복되면 파일을 나누거나 압축한 뒤 다시 시도해 주세요.`;
  }

  return `${providerLabel} API 호출 실패: ${message.slice(0, 220)}`;
}
