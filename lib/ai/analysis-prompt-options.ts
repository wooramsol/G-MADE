export type AnalysisPromptOptions = {
  /** 긴 평가에서 출력 토큰 절약 */
  compact?: boolean;
  /** 2차 이후 배치: documentSections 생략 */
  evaluationOnly?: boolean;
};
