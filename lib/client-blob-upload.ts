"use client";

import { upload, uploadPresigned } from "@vercel/blob/client";
import { ensureProjectOnServer } from "@/lib/client-ensure-project";
import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import type { BlobAccess } from "@/lib/blob-config";
import type { BlobUploadMode } from "@/lib/blob-upload-status";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { Project } from "@/lib/types";
import { buildProjectBlobPathname, validateUploadMetadata } from "@/lib/upload-validation";

type BlobUploadStatusResponse = {
  ready: boolean;
  mode: BlobUploadMode | null;
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
