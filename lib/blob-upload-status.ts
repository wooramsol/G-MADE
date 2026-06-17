import { getBlobAccess, hasBlobClientUploadToken, hasBlobStoreId } from "./blob-config";

export type BlobUploadMode = "read-write-token" | "oidc-presigned";

export type BlobUploadStatus = {
  ready: boolean;
  mode: BlobUploadMode | null;
  access: "public" | "private";
  hasClientUploadToken: boolean;
  hasStoreId: boolean;
  message?: string;
};

export function getBlobUploadStatus(): BlobUploadStatus {
  const hasClientUploadToken = hasBlobClientUploadToken();
  const hasStoreId = hasBlobStoreId();
  const access = getBlobAccess();

  if (hasClientUploadToken) {
    return {
      ready: true,
      mode: "read-write-token",
      access,
      hasClientUploadToken,
      hasStoreId,
    };
  }

  if (hasStoreId) {
    return {
      ready: true,
      mode: "oidc-presigned",
      access,
      hasClientUploadToken,
      hasStoreId,
    };
  }

  return {
    ready: false,
    mode: null,
    access,
    hasClientUploadToken,
    hasStoreId,
    message:
      "Vercel Blob 스토어가 프로젝트에 연결되지 않았습니다. Storage → g-made-blob → Projects에서 g-made를 연결한 뒤 Redeploy 해 주세요.",
  };
}
