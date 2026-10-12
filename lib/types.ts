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

/** 전문가 메모 — 특정 도서 버전의 특정 페이지 영역에 남긴 의견 */
export type ExpertMemo = {
  id: string;
  /** 도서 버전 키 (document-versions.ts versionKeyOfReview) — 메모는 작성한 버전에 묶인다 */
  versionKey: string;
  /** 메모를 단 PDF (검토 기록의 파일) */
  reviewId: string;
  fileId: string;
  fileName: string;
  /** 1부터 시작하는 페이지 번호 */
  page: number;
  /** 페이지 정규화 좌표 (0~1, 좌상단 원점) */
  region: { x: number; y: number; width: number; height: number };
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
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
  /** 도서 버전 이름 (버전 키 → 사용자가 붙인 이름, 예: "최초접수", "보완1") */
  documentVersionLabels?: Record<string, string>;
  /** 사전심의: 전문가 분석 — 도서 위 영역 표시 + 의견 메모 (작성자별, 프로젝트 사용자 모두 공유) */
  expertMemos?: ExpertMemo[];
  /** 휴지통으로 이동한 시각 (ISO). 설정되면 목록에서 숨깁니다. */
  deletedAt?: string;
  /** 데모 프로젝트 영구 삭제 표식 (ISO). 설정되면 데모 원본이 다시 병합되지 않습니다. */
  purgedAt?: string;
};
