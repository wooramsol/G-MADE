import crypto from "node:crypto";

/** 파일 원본 바이트의 내용 해시 (sha256, hex). 동일 파일 재업로드 감지에 사용합니다. */
export function hashFileBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * 파일 집합의 내용 지문을 계산합니다. 파일명+내용해시 조합을 정렬해 해시하므로,
 * 파일 하나라도 이름·내용이 다르면 값이 달라집니다.
 * contentHash가 없는 파일이 하나라도 섞여 있으면(예: 이 기능 도입 이전에 저장된 검토
 * 기록) 비교 불가로 간주해 null을 반환합니다 — 안전하게 "다른 문서"로 취급되어
 * 캐시 재사용을 시도하지 않습니다.
 */
export function computeFilesFingerprint(
  files: Array<{ originalName: string; contentHash?: string }>,
): string | null {
  if (files.length === 0) return null;
  if (files.some((file) => !file.contentHash)) return null;

  const parts = files.map((file) => `${file.originalName}:${file.contentHash}`).sort();
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}
