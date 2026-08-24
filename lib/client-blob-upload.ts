"use client";

import { upload, uploadPresigned } from "@vercel/blob/client";
import { ensureProjectOnServer } from "@/lib/client-ensure-project";
import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import type { BlobAccess } from "@/lib/blob-config";
import type { BlobUploadMode } from "@/lib/blob-upload-status";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { Project } from "@/lib/types";
import { buildProjectBlobPathname, validateUploadMetadata } from "@/lib/upload-validation";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

type BlobUploadStatusResponse = {
  ready: boolean;
  mode: BlobUploadMode | null;
  access: BlobAccess;
  message?: string;
};

async function fetchBlobUploadStatus(projectId: string): Promise<BlobUploadStatusResponse> {
  const response = await clientFetchWithTimeout(`/api/projects/${projectId}/files/upload`);
  const payload = (await response.json().catch(() => ({}))) as BlobUploadStatusResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, "Blob 업로드 설정을 확인할 수 없습니다."));
  }

  if (!payload.ready || !payload.mode) {
    throw new Error(payload.message ?? "Blob 클라이언트 업로드가 준비되지 않았습니다.");
  }

  return payload;
}

async function uploadWithStatus(
  projectId: string,
  file: File,
  status: BlobUploadStatusResponse,
  onProgress?: (loadedRatio: number) => void,
): Promise<StoredFileRef> {
  validateUploadMetadata(file.name, file.size);

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const pathname = buildProjectBlobPathname(projectId, id, file.name);
  const uploadOptions = {
    access: status.access,
    handleUploadUrl: `/api/projects/${projectId}/files/upload`,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: onProgress
      ? ({ loaded, total }: { loaded: number; total: number }) => {
          if (total > 0) onProgress(loaded / total);
        }
      : undefined,
  } as const;

  // R2 presigned: 서버에서 서명 URL을 받아 브라우저가 R2로 직접 PUT (진행률 표시)
  if (status.mode === "r2-presigned") {
    const contentType = file.type || "application/octet-stream";
    const presignResponse = await clientFetchWithTimeout(`/api/projects/${projectId}/files/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname, contentType, sizeBytes: file.size }),
    });
    const presignPayload = (await presignResponse.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!presignResponse.ok || !presignPayload.url) {
      throw new Error(extractApiErrorMessage(presignPayload, "업로드 URL 발급에 실패했습니다."));
    }

    await putFileWithProgress(presignPayload.url, file, contentType, onProgress);

    return {
      id,
      originalName: file.name,
      fileType: file.name.split(".").pop()?.toUpperCase() ?? "FILE",
      sizeBytes: file.size,
      storageKey: pathname,
      uploadedAt: new Date().toISOString(),
    };
  }

  const uploadFn = status.mode === "oidc-presigned" ? uploadPresigned : upload;

  let blob;
  try {
    blob = await uploadFn(pathname, file, uploadOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob 업로드에 실패했습니다.";
    throw new Error(message);
  }

  return {
    id,
    originalName: file.name,
    fileType: file.name.split(".").pop()?.toUpperCase() ?? "FILE",
    sizeBytes: file.size,
    storageKey: blob.pathname,
    blobUrl: blob.url,
    uploadedAt: new Date().toISOString(),
  };
}

/** XHR PUT — fetch와 달리 업로드 진행률 이벤트를 제공한다. */
function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (loadedRatio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`파일 업로드에 실패했습니다 (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("파일 업로드 중 네트워크 오류가 발생했습니다."));
    xhr.ontimeout = () => reject(new Error("파일 업로드가 시간 초과됐습니다."));
    xhr.timeout = 10 * 60_000;
    xhr.send(file);
  });
}

export async function uploadProjectFileToBlob(
  project: Project,
  file: File,
  onProgress?: (loadedRatio: number) => void,
): Promise<StoredFileRef> {
  await ensureProjectOnServer(project);
  const status = await fetchBlobUploadStatus(project.id);
  return uploadWithStatus(project.id, file, status, onProgress);
}

export async function uploadProjectFilesToBlob(
  project: Project,
  files: File[],
  onFileProgress?: (fileIndex: number, loadedRatio: number) => void,
): Promise<StoredFileRef[]> {
  await ensureProjectOnServer(project);
  const status = await fetchBlobUploadStatus(project.id);
  const uploaded: StoredFileRef[] = [];

  for (let index = 0; index < files.length; index += 1) {
    uploaded.push(
      await uploadWithStatus(project.id, files[index], status, (loadedRatio) => {
        onFileProgress?.(index, loadedRatio);
      }),
    );
  }

  return uploaded;
}
