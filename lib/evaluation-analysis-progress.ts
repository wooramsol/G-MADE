export type EvaluationAnalysisStepId =
  | "validate"
  | "upload"
  | "extract"
  | "law-context"
  | "ai-analysis"
  | "expert-analysis"
  | "save";

export type EvaluationAnalysisProgressEvent = {
  type: "progress";
  step: EvaluationAnalysisStepId;
  label: string;
  stepIndex: number;
  stepCount: number;
};

export type EvaluationAnalysisCompleteEvent = {
  type: "complete";
  round: unknown;
  project?: unknown;
  analysisMode?: string;
  warnings?: string[];
};

export type EvaluationAnalysisErrorEvent = {
  type: "error";
  error: string;
};

export type EvaluationAnalysisStreamEvent =
  | EvaluationAnalysisProgressEvent
  | EvaluationAnalysisCompleteEvent
  | EvaluationAnalysisErrorEvent;

export const EVALUATION_ANALYSIS_STEPS: Array<{ id: EvaluationAnalysisStepId; label: string }> = [
  { id: "validate", label: "입력 내용 확인" },
  { id: "upload", label: "평가 자료 저장" },
  { id: "extract", label: "문서 본문 추출" },
  { id: "law-context", label: "법령·공간정보 조회" },
  { id: "ai-analysis", label: "AI 평가 분석" },
  { id: "expert-analysis", label: "전문가 자료 분석" },
  { id: "save", label: "결과 저장" },
];

export const EVALUATION_ANALYSIS_BUDGET_SECONDS = 120;

export function formatRemainingSeconds(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  if (safe >= 60) {
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return rest > 0 ? `약 ${minutes}분 ${rest}초` : `약 ${minutes}분`;
  }
  return `약 ${safe}초`;
}
