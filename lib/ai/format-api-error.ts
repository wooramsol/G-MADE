type ParsedApiError = {
  code?: number;
  message?: string;
};

function parseApiErrorBody(body: string): ParsedApiError {
  try {
    const parsed = JSON.parse(body) as { error?: ParsedApiError };
    return parsed.error ?? {};
  } catch {
    return { message: body };
  }
}

export function formatProviderApiError(providerLabel: string, status: number, body: string): string {
  const parsed = parseApiErrorBody(body);
  const message = parsed.message ?? body;
  const code = parsed.code ?? status;
  const lowerMessage = message.toLowerCase();

  if (code === 429 || status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate")) {
    return `${providerLabel} 분당 요청 제한(RPM)에 걸렸습니다(429). 무료 티어는 1분에 몇 번만 호출할 수 있어, 짧은 시간에 여러 번 분석하면 발생합니다. 1~2분 후 한 번만 다시 시도해 주세요. (일일 총량을 다 쓴 것은 아닐 수 있습니다.) 지금은 데모 분석 결과를 표시합니다.`;
  }

  if (code === 404 || status === 404 || lowerMessage.includes("not found")) {
    return `${providerLabel} 모델을 찾을 수 없습니다(404). Vercel의 GEMINI_MODEL 값을 gemini-2.0-flash로 설정한 뒤 재배포해 주세요.`;
  }

  if (code === 401 || status === 401 || lowerMessage.includes("api key")) {
    return `${providerLabel} API 키가 올바르지 않습니다. Vercel의 API 키 설정을 확인해 주세요.`;
  }

  return `${providerLabel} API 호출 실패: ${message.slice(0, 220)}`;
}
