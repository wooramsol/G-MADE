/** Vercel 함수 maxDuration(300s)에 맞춘 평가 스트림 클라이언트 타임아웃. */
export const EVALUATION_STREAM_TIMEOUT_MS = 280_000;

const DEFAULT_CLIENT_FETCH_TIMEOUT_MS = 120_000;

export async function clientFetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_CLIENT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`요청이 ${Math.round(timeoutMs / 1000)}초를 초과했습니다. 잠시 후 다시 시도해 주세요.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
