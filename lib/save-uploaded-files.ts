import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getWritableStoragePath } from "./runtime-storage";
import type { ProjectFile } from "./types";

const allowedExtensions = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "xls",
  "jpg",
  "jpeg",
  "png",
  "dwg",
  "zip",
  "txt",
  "md",
  "hwp",
]);
const maxFileSizeBytes = 25 * 1024 * 1024;

export type SavedUploadFile = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
};

export async function saveUploadedFiles(files: File[]): Promise<SavedUploadFile[]> {
  const uploadDir = getWritableStoragePath("uploads");
  await mkdir(uploadDir, { recursive: true });

  const savedFiles: SavedUploadFile[] = [];

  for (const file of files) {
    validateUploadFile(file);

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const safeName = sanitizeFileName(file.name);
    const storedName = `${id}-${safeName}`;
    const storagePath = path.join(uploadDir, storedName);
    await writeFile(storagePath, buffer);

    savedFiles.push({
      id,
      originalName: file.name,
      fileType: file.type || inferFileType(file.name),
      sizeBytes: file.size,
      storagePath,
    });
  }

  return savedFiles;
}

export function toProjectFiles(savedFiles: SavedUploadFile[], uploadedAt: string): ProjectFile[] {
  return savedFiles.map((file) => ({
    id: file.id,
    fileName: file.originalName,
    fileType: formatStoredFileType(file.originalName, file.fileType),
    analysisStatus: "완료",
    uploadedAt,
    sizeBytes: file.sizeBytes,
  }));
}

export function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

function validateUploadFile(file: File) {
  const extension = getExtension(file.name);

  if (!allowedExtensions.has(extension)) {
    throw new Error(`지원하지 않는 파일 형식입니다: ${file.name}`);
  }

  if (file.size > maxFileSizeBytes) {
    throw new Error(`파일 용량은 25MB 이하만 지원합니다: ${file.name}`);
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
}

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function inferFileType(fileName: string): string {
  const extension = getExtension(fileName);
  return extension ? `application/${extension}` : "application/octet-stream";
}

function formatStoredFileType(fileName: string, fallbackType: string): string {
  const extension = getExtension(fileName);
  return extension ? extension.toUpperCase() : fallbackType;
}
