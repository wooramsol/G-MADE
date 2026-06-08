export const LAW_OC_MISSING_WARNING =
  "LAW_OC가 없어 국가법령정보 API 대신 내장 법령 요약을 사용했습니다.";

export function filterStaleLawWarnings(
  warnings: string[],
  lawApiConfigured: boolean | null,
): string[] {
  if (!lawApiConfigured) return warnings;
  return warnings.filter((warning) => warning !== LAW_OC_MISSING_WARNING);
}

export function hadLawOcMissingWarning(warnings: string[]): boolean {
  return warnings.includes(LAW_OC_MISSING_WARNING);
}
