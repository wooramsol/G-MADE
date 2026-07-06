export type BlobAccess = "public" | "private";

const VERCEL_SERVERLESS_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export function getBlobAccess(): BlobAccess {
  const configured = process.env.BLOB_DEFAULT_ACCESS?.trim().toLowerCase();
  if (configured === "private" || configured === "public") {
    return configured;
  }
  // 심의 자료(도면·보고서)가 공개 URL로 노출되지 않도록 기본값은 private.
  // 다운로드는 인증된 API(/api/projects/{id}/files/{fileId})를 통해서만 제공된다.
  return "private";
}

export function hasBlobClientUploadToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function hasBlobStoreId(): boolean {
  return Boolean(process.env.BLOB_STORE_ID?.trim());
}

export function isBlobStorageConfigured(): boolean {
  return hasBlobClientUploadToken() || hasBlobStoreId();
}

export function exceedsServerlessUploadLimit(totalBytes: number): boolean {
  return totalBytes > VERCEL_SERVERLESS_BODY_LIMIT_BYTES;
}

export const SERVERLESS_UPLOAD_LIMIT_LABEL = "4.5MB";
