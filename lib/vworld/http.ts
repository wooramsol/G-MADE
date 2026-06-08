import { getVWorldDomain } from "./config";

const REQUEST_TIMEOUT_MS = 20_000;

export type VWorldHttpResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; error: string; rawBody?: string };

export async function vworldGetJson<T>(url: string, label: string): Promise<VWorldHttpResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/xml, text/plain, */*",
        "User-Agent": "G-MADE-HIVE/1.0",
      },
    });

    const rawBody = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `${label} HTTP ${response.status}`,
        rawBody: rawBody.slice(0, 500),
      };
    }

    try {
      return {
        ok: true,
        data: JSON.parse(rawBody) as T,
        status: response.status,
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        error: `${label} 응답이 JSON이 아닙니다.`,
        rawBody: rawBody.slice(0, 500),
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 408, error: `${label} 요청 시간이 초과되었습니다.` };
    }

    const message = error instanceof Error ? error.message : "알 수 없는 네트워크 오류";
    return {
      ok: false,
      status: 0,
      error: `${label} 연결 실패: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildVWorldParams(params: Record<string, string>): URLSearchParams {
  const search = new URLSearchParams(params);
  search.set("domain", getVWorldDomain());
  return search;
}

export function extractVWorldError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const response = (payload as { response?: { status?: string; error?: { text?: string; message?: string } } }).response;
  if (!response) return null;

  if (response.status && response.status !== "OK" && response.status !== "NOT_FOUND") {
    return response.error?.text ?? response.error?.message ?? `브이월드 상태: ${response.status}`;
  }

  return null;
}
