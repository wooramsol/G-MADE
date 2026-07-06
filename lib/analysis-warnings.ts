/** 분석 경고 목록에서 동일 문구를 제거합니다. */
export function dedupeWarnings(warnings: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const warning of warnings) {
    const normalized = warning.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

/** 화면에 보이지 않을 내부 보정·운영 안내 경고입니다. */
const HIDDEN_ANALYSIS_WARNING_PATTERNS = [
  /보정했습니다/,
  /제출 자료·조회 맥락에서 확인되지 않은/,
  /평가 문구가 포함되어/,
  /칭찬·긍정 위주/,
  /요약:.*보정/,
  /분석: 평가 항목 \d+개를 \d+회로 나누어 처리합니다/,
  /데모 분석 모드로 생성된 예시/,
] as const;

export function isHiddenAnalysisWarning(warning: string): boolean {
  const normalized = warning.trim();
  if (!normalized) return true;
  return HIDDEN_ANALYSIS_WARNING_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** 분석 실패·예외 상황만 남기고 내부 보정 안내는 제거합니다. */
export function filterUserFacingAnalysisWarnings(warnings: string[]): string[] {
  return dedupeWarnings(warnings).filter((warning) => !isHiddenAnalysisWarning(warning));
}

/** 평가 컨텍스트·AI·전문가 분석 경고를 합치되 컨텍스트 경고는 한 번만 포함합니다. */
export function mergeRoundAnalysisWarnings(
  contextWarnings: string[],
  aiWarnings: string[] = [],
  expertWarnings: string[] = [],
  extraWarnings: string[] = [],
): string[] {
  const contextSet = new Set(contextWarnings);

  return filterUserFacingAnalysisWarnings([
    ...contextWarnings,
    ...aiWarnings.filter((warning) => !contextSet.has(warning)),
    ...expertWarnings.filter((warning) => !contextSet.has(warning)),
    ...extraWarnings,
  ]);
}
