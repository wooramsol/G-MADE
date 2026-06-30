export type AnalysisPromptOptions = {
  /** 긴 평가에서 출력 토큰 절약 */
  compact?: boolean;
  /** 2차 이후 배치: documentSections 생략 */
  evaluationOnly?: boolean;
  /** PDF·이미지 비전 블록 포함 (배치 2차부터는 false 권장) */
  includeVision?: boolean;
};
