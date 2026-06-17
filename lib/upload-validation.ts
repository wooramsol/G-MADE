import { MAX_UPLOAD_FILE_BYTES, getMaxUploadFileLabel } from "./upload-limits";

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

export function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
}

export function buildProjectBlobPathname(projectId: string, fileId: string, fileName: string): string {
  const safeName = sanitizeFileName(fileName);
  return `projects/${projectId}/files/${fileId}-${safeName}`;
}

export function validateUploadMetadata(fileName: string, sizeBytes: number) {
  validateUploadExtension(fileName);

  if (sizeBytes > MAX_UPLOAD_FILE_BYTES) {
    throw new Error(`파일 용량은 ${getMaxUploadFileLabel()} 이하만 지원합니다: ${fileName}`);
  }
}

export function validateUploadExtension(fileName: string) {
  const extension = getExtension(fileName);

  if (!allowedExtensions.has(extension)) {
    throw new Error(`지원하지 않는 파일 형식입니다: ${fileName}`);
  }
}

export function formatStoredFileType(fileName: string, fallbackType: string): string {
  const extension = getExtension(fileName);
  return extension ? extension.toUpperCase() : fallbackType;
}

function inferFileType(fileName: string): string {
  const extension = getExtension(fileName);
  return extension ? `application/${extension}` : "application/octet-stream";
}

export function inferUploadContentType(fileName: string, fallbackType?: string): string {
  return fallbackType || inferFileType(fileName);
}
