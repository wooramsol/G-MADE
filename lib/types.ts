import type { ChecklistReview } from "./checklist-review/types";

export type RoleCode = "ADMIN" | "REVIEWER" | "OFFICER";

export type LawReference = {
  id: string;
  title: string;
  article: string;
  summary: string;
  jurisdiction: string;
};

export type Guideline = {
  id: string;
  title: string;
  section: string;
  summary: string;
  sourceUrl?: string;
};

export type ProjectFile = {
  id: string;
  fileName: string;
  fileType: string;
  analysisStatus: "대기" | "분석중" | "완료";
  uploadedAt?: string;
  sizeBytes?: number;
  /** Vercel Blob pathname */
  storageKey?: string;
  blobUrl?: string;
};

export type ProjectLocationPoint = {
  x: number;
  y: number;
  source: "address" | "place" | "map";
  note?: string;
  /** 시·도 ~ 읍·면·동 행정구역 (도로명·지번 제외) */
  adminRegion?: string;
};

export type Project = {
  id: string;
  name: string;
  location: string;
  locationPoint?: ProjectLocationPoint;
  client: string;
  designer: string;
  projectType: string;
  scale: string;
  reviewType: string;
  receivedAt: string;
  summary?: string;
  updatedAt?: string;
  status: "접수" | "심사 진행중" | "완료";
  files: ProjectFile[];
  /** 체크리스트 기반 AI 사전검토 기록 */
  checklistReviews?: ChecklistReview[];
  /** 휴지통으로 이동한 시각 (ISO). 설정되면 목록에서 숨깁니다. */
  deletedAt?: string;
  /** 데모 프로젝트 영구 삭제 표식 (ISO). 설정되면 데모 원본이 다시 병합되지 않습니다. */
  purgedAt?: string;
};
