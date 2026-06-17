import { getBlobAccess, getBlobClientUploadSetupMessage, hasBlobClientUploadToken } from "./blob-config";

export type BlobUploadStatus = {
  ready: boolean;
  access: "public" | "private";
  hasClientUploadToken: boolean;
  hasStoreId: boolean;
  message?: string;
};

export function getBlobUploadStatus(): BlobUploadStatus {
  const hasClientUploadToken = hasBlobClientUploadToken();
  const hasStoreId = Boolean(process.env.BLOB_STORE_ID?.trim());

  if (!hasClientUploadToken) {
    return {
      ready: false,
      access: getBlobAccess(),
      hasClientUploadToken,
      hasStoreId,
      message: getBlobClientUploadSetupMessage(),
    };
  }

  return {
    ready: true,
    access: getBlobAccess(),
    hasClientUploadToken,
    hasStoreId,
  };
}
