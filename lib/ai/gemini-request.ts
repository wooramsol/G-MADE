import { fetchWithTimeout } from "../fetch-with-timeout";

export async function requestGeminiGenerateContent(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  timeoutMs = 90_000,
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}
