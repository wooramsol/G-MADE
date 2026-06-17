export const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;

export function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

export function getOversizedUploadFiles(files: File[]): File[] {
  return files.filter((file) => file.size > MAX_UPLOAD_FILE_BYTES);
}

export function buildOversizedUploadMessage(files: File[], label: string): string {
  const oversized = getOversizedUploadFiles(files);
  if (oversized.length === 0) return "";

  const names = oversized
    .map((file) => `"${file.name}" (${formatUploadBytes(file.size)})`)
    .join(", ");

  return `${label} 파일 용량이 25MB를 초과합니다: ${names}. PDF를 장별로 나누거나 압축한 뒤 다시 업로드해 주세요.`;
}
