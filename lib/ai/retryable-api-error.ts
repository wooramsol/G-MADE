export function isRetryableProviderError(status: number, body: string): boolean {
  const lower = body.toLowerCase();

  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529) {
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
