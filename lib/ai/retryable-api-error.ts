export function isRetryableProviderError(status: number, body: string): boolean {
  const lower = body.toLowerCase();

  // 429/5xx: Anthropic 자체 오류. 520~524: Cloudflare가 api.anthropic.com 앞단에서
  // 반환하는 일시적 엣지/오리진 연결 오류(Anthropic 쪽 문제이며 우리 코드와 무관) —
  // 몇 초 후 재시도하면 대부분 해소됨.
  if (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 520 ||
    status === 521 ||
    status === 522 ||
    status === 523 ||
    status === 524 ||
    status === 529
  ) {
    return true;
  }

  return (
    lower.includes("high demand") ||
    lower.includes("overloaded") ||
    lower.includes("rate limit") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("resource exhausted") ||
    lower.includes("try again later")
  );
}

export function retryDelayMs(attempt: number): number {
  return 4_000 * (attempt + 1);
}
