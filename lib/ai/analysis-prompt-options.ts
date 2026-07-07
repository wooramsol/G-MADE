export type AnalysisPromptOptions = {
  /** 긴 평가에서 출력 토큰 절약 */
  compact?: boolean;
  /** 2차 이후 배치: documentSections 생략 */
  evaluationOnly?: boolean;
  /** PDF·이미지 비전 블록 포함 (배치 2차부터는 false 권장) */
  includeVision?: boolean;
  /** 분할 분석 시 전체 회차 수 (타임아웃 예산 분배용) */
  batchCount?: number;
  /** 기본 분석 프롬프트 대신 사용할 사용자 프롬프트(상호 피드백 등) */
  userPromptOverride?: string;
  /** 종합 평가 초기 분석: 비전 생략·경량 모델 우선 */
  ensembleFast?: boolean;
};
