import dns from "node:dns";
import https from "node:https";
import { getVWorldDomain } from "./config";

dns.setDefaultResultOrder("ipv4first");

const REQUEST_TIMEOUT_MS = 20_000;

export type VWorldHttpResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; error: string; rawBody?: string };

function httpsGetText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json, text/xml, text/plain, */*",
          "User-Agent": "G-MADE-HIVE/1.0",
          Connection: "close",
        },
        timeout: REQUEST_TIMEOUT_MS,
        family: 4,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0, body });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("요청 시간이 초과되었습니다."));
    });
    request.on("error", reject);
  });
}

function formatNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return "알 수 없는 네트워크 오류";

  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.message}${cause}`;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_500;

function isRetryableResult(result: { ok: boolean; status: number }): boolean {
  if (result.ok) return false;
  // 네트워크 실패(0), 타임아웃(408), 일시적 서버 오류(5xx)는 재시도
  return result.status === 0 || result.status === 408 || result.status >= 500;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function vworldGetJson<T>(url: string, label: string): Promise<VWorldHttpResult<T>> {
  let lastResult: VWorldHttpResult<T> | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    lastResult = await vworldGetJsonOnce<T>(url, label);
    if (!isRetryableResult(lastResult)) {
      return lastResult;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleepMs(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return lastResult!;
}

async function vworldGetJsonOnce<T>(url: string, label: string): Promise<VWorldHttpResult<T>> {
  try {
    const { status, body } = await httpsGetText(url);

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        status,
        error: `${label} HTTP ${status}`,
        rawBody: body.slice(0, 500),
      };
    }

    try {
      return {
        ok: true,
        data: JSON.parse(body) as T,
        status,
      };
    } catch {
      return {
        ok: false,
        status,
        error: `${label} 응답이 JSON이 아닙니다.`,
        rawBody: body.slice(0, 500),
      };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("시간이 초과")) {
      return { ok: false, status: 408, error: `${label} 요청 시간이 초과되었습니다.` };
    }

    return {
      ok: false,
      status: 0,
      error: `${label} 연결 실패: ${formatNetworkError(error)}`,
    };
  }
}

export function buildVWorldParams(params: Record<string, string>): URLSearchParams {
  const search = new URLSearchParams(params);

  if (process.env.VWORLD_SEND_DOMAIN !== "false") {
    search.set("domain", getVWorldDomain());
  }

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
