export type BlobAccess = "public" | "private";

const VERCEL_SERVERLESS_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export function getBlobAccess(): BlobAccess {
  const configured = process.env.BLOB_DEFAULT_ACCESS?.trim().toLowerCase();
  if (configured === "private" || configured === "public") {
    return configured;
  }
  return "public";
}

/** 클라이언트 직접 업로드(handleUpload)는 정적 read-write 토큰이 필요합니다. */
export function hasBlobClientUploadToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isBlobStorageConfigured(): boolean {
  return hasBlobClientUploadToken() || Boolean(process.env.BLOB_STORE_ID?.trim());
}

export function getBlobClientUploadSetupMessage(): string {
  return [
    "Vercel Blob 클라이언트 업로드 토큰이 없습니다.",
    "Vercel 대시보드 → Storage → g-made-blob → Connect / Settings에서",
    "BLOB_READ_WRITE_TOKEN을 Production·Preview에 연결한 뒤 Redeploy 해 주세요.",
  ].join(" ");
}

export function exceedsServerlessUploadLimit(totalBytes: number): boolean {
  return totalBytes > VERCEL_SERVERLESS_BODY_LIMIT_BYTES;
}

export const SERVERLESS_UPLOAD_LIMIT_LABEL = "4.5MB";
