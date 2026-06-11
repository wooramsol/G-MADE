const DEFAULT_AI_FETCH_TIMEOUT_MS = 90_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_AI_FETCH_TIMEOUT_MS,
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
      throw new Error(`AI API 응답이 ${Math.round(timeoutMs / 1000)}초를 초과했습니다. 잠시 후 다시 시도해 주세요.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
