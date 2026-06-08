import https from "node:https";
import { getLawReferer } from "./config";

const REQUEST_TIMEOUT_MS = 20_000;
const LAW_BASE_URL = "https://www.law.go.kr";

export type LawHttpResult<T> =
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
          Referer: getLawReferer(),
          Connection: "close",
        },
        timeout: REQUEST_TIMEOUT_MS,
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

export async function lawGetJson<T>(path: string, params: Record<string, string>, label: string): Promise<LawHttpResult<T>> {
  const search = new URLSearchParams(params);
  const url = `${LAW_BASE_URL}${path}?${search.toString()}`;

  try {
    const { status, body } = await httpsGetText(url);

    if (status < 200 || status >= 300) {
      return { ok: false, status, error: `${label} HTTP ${status}`, rawBody: body.slice(0, 500) };
    }

    if (body.includes("사용자 정보 검증") || body.includes("인증키")) {
      return { ok: false, status, error: `${label}: 국가법령정보 API 인증 실패 (LAW_OC·Referer 확인)`, rawBody: body.slice(0, 300) };
    }

    try {
      return { ok: true, data: JSON.parse(body) as T, status };
    } catch {
      return { ok: false, status, error: `${label} 응답이 JSON이 아닙니다.`, rawBody: body.slice(0, 500) };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 네트워크 오류";
    return { ok: false, status: 0, error: `${label} 연결 실패: ${message}` };
  }
}
