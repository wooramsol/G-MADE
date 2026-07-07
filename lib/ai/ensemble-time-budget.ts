/** 종합 평가 1단계: 엔진별 초기 분석 상한(병렬이므로 전체 구간 ≈ 이 값) */
export const ENSEMBLE_INITIAL_PROVIDER_TIMEOUT_MS = 105_000;

/** Claude는 PDF·비전 처리로 더 오래 걸릴 수 있어 별도 상한을 둡니다. */
export const ENSEMBLE_CLAUDE_INITIAL_TIMEOUT_MS = 130_000;

/** 종합 평가 2단계: 중재 합성(텍스트 전용) 상한 */
export const ENSEMBLE_ARBITER_TIMEOUT_MS = 75_000;

/** 2단계를 시작하기 위해 필요한 최소 잔여 시간 */
export const ENSEMBLE_MIN_BUDGET_FOR_ARBITER_MS = 80_000;

/** save·응답 직전 여유 */
export const ENSEMBLE_DEADLINE_BUFFER_MS = 25_000;

export function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    return Promise.reject(new Error(`${label} 시간이 부족합니다.`));
  }

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} 시간 초과(${Math.round(timeoutMs / 1000)}초)`));
      }, timeoutMs);
    }),
  ]);
}
