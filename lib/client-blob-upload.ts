"use client";

import { upload } from "@vercel/blob/client";
import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import type { BlobAccess } from "@/lib/blob-config";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import { buildProjectBlobPathname, validateUploadMetadata } from "@/lib/upload-validation";

type BlobUploadStatusResponse = {
  ready: boolean;
  access: BlobAccess;
  message?: string;
};

async function fetchBlobUploadStatus(projectId: string): Promise<BlobUploadStatusResponse> {
  const response = await fetch(`/api/projects/${projectId}/files/upload`);
  const payload = (await response.json().catch(() => ({}))) as BlobUploadStatusResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, "Blob 업로드 설정을 확인할 수 없습니다."));
  }

  if (!payload.ready) {
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

  let blob;
  try {
    blob = await upload(pathname, file, {
      access: status.access,
      handleUploadUrl: `/api/projects/${projectId}/files/upload`,
      onUploadProgress: onProgress
        ? ({ loaded, total }) => {
            if (total > 0) onProgress(loaded / total);
          }
        : undefined,
    });
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

export async function uploadProjectFileToBlob(
  projectId: string,
  file: File,
  onProgress?: (loadedRatio: number) => void,
): Promise<StoredFileRef> {
  const status = await fetchBlobUploadStatus(projectId);
  return uploadWithStatus(projectId, file, status, onProgress);
}

export async function uploadProjectFilesToBlob(
  projectId: string,
  files: File[],
  onFileProgress?: (fileIndex: number, loadedRatio: number) => void,
): Promise<StoredFileRef[]> {
  const status = await fetchBlobUploadStatus(projectId);
  const uploaded: StoredFileRef[] = [];

  for (let index = 0; index < files.length; index += 1) {
    uploaded.push(
      await uploadWithStatus(projectId, files[index], status, (loadedRatio) => {
        onFileProgress?.(index, loadedRatio);
      }),
    );
  }

  return uploaded;
}
