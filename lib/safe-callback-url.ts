/**
 * 로그인 후 리다이렉트 경로를 같은 오리진의 상대 경로로만 제한한다.
 * `//evil.com`, `/\evil.com` 같은 protocol-relative URL로의 open redirect를 차단한다.
 */
export function sanitizeCallbackUrl(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
