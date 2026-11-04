/**
 * Vercel Blob 저장소 주소인지 — 사용자가 보낸 임의 주소를 서버가 대신 요청(SSRF)하거나
 * 저장소 토큰을 실어 보내거나, 다른 사이트로 이동(open redirect)시키지 않도록 확인한다.
 */
export function isTrustedBlobUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
