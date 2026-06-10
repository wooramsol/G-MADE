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

/** 평가 컨텍스트·AI·전문가 분석 경고를 합치되 컨텍스트 경고는 한 번만 포함합니다. */
export function mergeRoundAnalysisWarnings(
  contextWarnings: string[],
  aiWarnings: string[] = [],
  expertWarnings: string[] = [],
  extraWarnings: string[] = [],
): string[] {
  const contextSet = new Set(contextWarnings);

  return dedupeWarnings([
    ...contextWarnings,
    ...aiWarnings.filter((warning) => !contextSet.has(warning)),
    ...expertWarnings.filter((warning) => !contextSet.has(warning)),
    ...extraWarnings,
  ]);
}
