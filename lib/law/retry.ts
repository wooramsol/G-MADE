const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 400;

export function isRetryableLawHttpError(error: string): boolean {
  if (error.includes("인증 실패") || error.includes("인증키")) return false;
  if (error.includes("응답이 JSON이 아닙니다")) return false;

  if (
    error.includes("ECONNRESET") ||
    error.includes("ECONNREFUSED") ||
    error.includes("ETIMEDOUT") ||
    error.includes("시간이 초과") ||
    error.includes("연결 실패")
  ) {
    return true;
  }

  return /HTTP 5\d{2}/.test(error);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withLawRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastResult: T | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await operation();
    if (!shouldRetry(lastResult) || attempt === maxAttempts) {
      return lastResult;
    }

    await sleepMs(baseDelayMs * attempt);
  }

  return lastResult as T;
}
