import {
  deletePersistedUploadFiles,
  readPersistedUploadFile,
  uploadBufferToProjectBlob,
  type PersistedUploadFile,
} from "./blob-file-storage";
import { storedRefToProjectFile } from "./stored-file-ref";
import type { ProjectFile } from "./types";
import type { StoredFileRef } from "./stored-file-ref";

export type SavedUploadFile = PersistedUploadFile;

export async function saveUploadedFiles(projectId: string, files: File[]): Promise<SavedUploadFile[]> {
  const savedFiles: SavedUploadFile[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    savedFiles.push(
      await uploadBufferToProjectBlob(projectId, file.name, buffer, file.type || undefined),
    );
  }

  return savedFiles;
}

export function toProjectFiles(savedFiles: SavedUploadFile[], uploadedAt: string): ProjectFile[] {
  return savedFiles.map((file) => ({
    id: file.id,
    fileName: file.originalName,
    fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
    analysisStatus: "완료",
    uploadedAt,
    sizeBytes: file.sizeBytes,
    storageKey: file.storageKey,
    blobUrl: file.blobUrl,
  }));
}

export function storedRefsToSavedFiles(refs: StoredFileRef[]): SavedUploadFile[] {
  return refs.map((ref) => ({
    id: ref.id,
    originalName: ref.originalName,
    fileType: ref.fileType,
    sizeBytes: ref.sizeBytes,
    storageKey: ref.storageKey,
    blobUrl: ref.blobUrl,
  }));
}

export function storedRefsToProjectFiles(refs: StoredFileRef[], uploadedAt: string): ProjectFile[] {
  return refs.map((ref) => storedRefToProjectFile(ref, uploadedAt));
}

export async function readSavedUploadFile(file: SavedUploadFile): Promise<Buffer> {
  return readPersistedUploadFile(file);
}

export async function deleteSavedUploadFiles(files: SavedUploadFile[]): Promise<void> {
  await deletePersistedUploadFiles(files);
}

export function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}
