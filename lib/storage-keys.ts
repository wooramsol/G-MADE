/** 프로젝트 업로드 파일 경로 — projects/<프로젝트id>/files/<파일이름> (하위 폴더·..·역슬래시 불가) */
export function isProjectFileKey(projectId: string, key: string | undefined | null): key is string {
  if (!key || !projectId) return false;
  const prefix = `projects/${projectId}/files/`;
  if (!key.startsWith(prefix)) return false;
  const name = key.slice(prefix.length);
  if (!name || name.length > 300) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return true;
}

/** 전문가 의견 id 형식 (memo-<uuid>) */
export function isMemoId(value: string): boolean {
  return /^memo-[0-9a-f-]{8,64}$/i.test(value);
}
