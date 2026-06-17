"use client";

import { upload } from "@vercel/blob/client";
import { buildProjectBlobPathname, validateUploadMetadata } from "@/lib/upload-validation";
import type { StoredFileRef } from "@/lib/stored-file-ref";

export async function uploadProjectFileToBlob(
  projectId: string,
  file: File,
  onProgress?: (loadedRatio: number) => void,
): Promise<StoredFileRef> {
  validateUploadMetadata(file.name, file.size);

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const pathname = buildProjectBlobPathname(projectId, id, file.name);

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: `/api/projects/${projectId}/files/upload`,
    onUploadProgress: onProgress
      ? ({ loaded, total }) => {
          if (total > 0) onProgress(loaded / total);
        }
      : undefined,
  });

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

export async function uploadProjectFilesToBlob(
  projectId: string,
  files: File[],
  onFileProgress?: (fileIndex: number, loadedRatio: number) => void,
): Promise<StoredFileRef[]> {
  const uploaded: StoredFileRef[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    uploaded.push(
      await uploadProjectFileToBlob(projectId, file, (loadedRatio) => {
        onFileProgress?.(index, loadedRatio);
      }),
    );
  }

  return uploaded;
}
