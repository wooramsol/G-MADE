import type { EvaluationSessionFile, Project, ProjectFile } from "./types";

/** Blob에 저장된 프로젝트 자료 참조 (차수 간 재사용) */
export type StoredFileRef = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storageKey: string;
  blobUrl?: string;
  /** 마지막으로 사용된 평가 차수 라벨 (예: 1차) */
  lastUsedRoundLabel?: string;
  uploadedAt?: string;
};

export function projectFileToStoredRef(file: ProjectFile): StoredFileRef | null {
  if (!file.storageKey) return null;

  return {
    id: file.id,
    originalName: file.fileName,
    fileType: file.fileType,
    sizeBytes: file.sizeBytes ?? 0,
    storageKey: file.storageKey,
    blobUrl: file.blobUrl,
    uploadedAt: file.uploadedAt,
  };
}

export function sessionFileToStoredRef(file: EvaluationSessionFile): StoredFileRef | null {
  if (!file.storageKey) return null;

  return {
    id: file.id,
    originalName: file.originalName,
    fileType: file.fileType,
    sizeBytes: file.sizeBytes,
    storageKey: file.storageKey,
    blobUrl: file.blobUrl,
  };
}

export function storedRefToSessionFile(ref: StoredFileRef): EvaluationSessionFile {
  return {
    id: ref.id,
    originalName: ref.originalName,
    fileType: ref.fileType,
    sizeBytes: ref.sizeBytes,
    storageKey: ref.storageKey,
    blobUrl: ref.blobUrl,
  };
}

export function storedRefToProjectFile(ref: StoredFileRef, uploadedAt: string): ProjectFile {
  return {
    id: ref.id,
    fileName: ref.originalName,
    fileType: ref.fileType,
    analysisStatus: "완료",
    uploadedAt,
    sizeBytes: ref.sizeBytes,
    storageKey: ref.storageKey,
    blobUrl: ref.blobUrl,
  };
}
