import type { ChecklistReview } from "./types";
import type { Project } from "@/lib/types";

export const CHECKLIST_REVIEW_STEPS = [
  { id: "validate", label: "요청 확인" },
  { id: "upload", label: "자료 저장" },
  { id: "extract", label: "문서 텍스트·도면 추출" },
  { id: "checklist", label: "체크리스트 항목 인식" },
  { id: "context", label: "법령·공간정보 조회" },
  { id: "evaluate", label: "AI 항목별 평가" },
  { id: "save", label: "결과 저장" },
] as const;

export type ChecklistReviewStepId = (typeof CHECKLIST_REVIEW_STEPS)[number]["id"];

export type ChecklistReviewProgressEvent = {
  type: "progress";
  step: ChecklistReviewStepId;
  label: string;
  stepIndex: number;
  stepCount: number;
};

export type ChecklistReviewStreamEvent =
  | ChecklistReviewProgressEvent
  | { type: "heartbeat"; at: number }
  | { type: "complete"; review: ChecklistReview; project?: Project; warnings?: string[] }
  | { type: "error"; error: string };

/** 서버리스 함수 한도(300s) 내 응답을 위한 서버 마감. */
export const CHECKLIST_SERVER_DEADLINE_MS = 285_000;

export const CHECKLIST_SERVER_DEADLINE_MESSAGE =
  "분석 시간이 서버 한도를 초과했습니다. 파일 수를 줄이거나 나누어 다시 시도해 주세요.";
