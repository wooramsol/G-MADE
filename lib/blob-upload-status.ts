import { getBlobAccess, hasBlobClientUploadToken, hasBlobStoreId } from "./blob-config";
import { isR2Configured } from "./r2-storage";

export type BlobUploadMode = "read-write-token" | "oidc-presigned" | "r2-presigned";

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

  // R2가 설정돼 있으면 항상 R2 presigned 업로드 사용 (전송료 없는 주 저장소)
  if (isR2Configured()) {
    return {
      ready: true,
      mode: "r2-presigned",
      access,
      hasClientUploadToken,
      hasStoreId,
    };
  }

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
      "파일 저장소가 설정되지 않았습니다. R2_* 환경변수(권장) 또는 Vercel Blob 연결을 확인한 뒤 Redeploy 해 주세요.",
  };
}
