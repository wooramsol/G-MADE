export const LAW_OC_MISSING_WARNING =
  "LAW_OC가 없어 국가법령정보 API 대신 내장 법령 요약을 사용했습니다.";

/** 법령 검색 실패 시 조회 대상·원인을 구분해 표시합니다. */
export function formatLawSearchFailure(query: string, error: unknown): string {
  const detail = describeLawSearchError(error);
  return `「${query.trim()}」 법령 조회 실패 — ${detail}`;
}

/** 행정규칙 검색 실패 시 조회 대상·원인을 구분해 표시합니다. */
export function formatAdmrulSearchFailure(query: string, error: unknown): string {
  const detail = describeLawSearchError(error);
  return `「${query.trim()}」 행정규칙 조회 실패 — ${detail}`;
}

function describeLawSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("인증 실패") || message.includes("인증키")) {
    return "국가법령정보 API 인증에 실패했습니다. Vercel의 LAW_OC·LAW_REFERER 설정을 확인해 주세요.";
  }
  if (message.includes("응답이 JSON이 아닙니다")) {
    return "법령정보센터 응답 형식이 올바르지 않습니다.";
  }

  const httpMatch = message.match(/HTTP (\d{3})/);
  if (httpMatch) {
    return `법령정보센터 HTTP ${httpMatch[1]} 오류가 발생했습니다.`;
  }
  if (message.includes("ECONNRESET")) {
    return "법령정보센터(law.go.kr)와의 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (message.includes("ETIMEDOUT") || message.includes("시간이 초과")) {
    return "법령정보센터 응답 시간이 초과되었습니다.";
  }
  if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
    return "법령정보센터 주소에 연결할 수 없습니다.";
  }
  if (message.includes("ECONNREFUSED")) {
    return "법령정보센터가 연결을 거부했습니다.";
  }

  const stripped = message
    .replace(/^법령검색\([^)]+\)\s*/, "")
    .replace(/^연결 실패:\s*/, "")
    .trim();

  return stripped || "알 수 없는 오류가 발생했습니다.";
}

export function filterStaleLawWarnings(
  warnings: string[],
  lawApiConfigured: boolean | null,
): string[] {
  if (!lawApiConfigured) return warnings;
  return warnings.filter((warning) => warning !== LAW_OC_MISSING_WARNING);
}

export function hadLawOcMissingWarning(warnings: string[]): boolean {
  return warnings.includes(LAW_OC_MISSING_WARNING);
}
