export type BlobAccess = "public" | "private";

const VERCEL_SERVERLESS_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export function getBlobAccess(): BlobAccess {
  const configured = process.env.BLOB_DEFAULT_ACCESS?.trim().toLowerCase();
  if (configured === "private" || configured === "public") {
    return configured;
  }
  return "public";
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
