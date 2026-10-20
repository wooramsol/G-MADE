import type { ChecklistReview } from "./checklist-review/types";

/** ADMIN 관리자 · OFFICER 공무원 · APPLICANT 지원자 (REVIEWER는 과거 계정 호환용 — 공무원과 같은 권한) */
export type RoleCode = "ADMIN" | "REVIEWER" | "OFFICER" | "APPLICANT";

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
  /** 본심의 — 이 의견을 낸 심사위원 (공무원이 대신 입력) */
  reviewerId?: string;
  reviewerName?: string;
  reviewerColor?: string;
  createdAt: string;
  updatedAt?: string;
};

/** 심의 단계 — 1 도서접수 · 2 사전심의 · 3 본심의 (반려 시 종료) */
export type ProjectStage = "RECEPTION" | "PRE_REVIEW" | "MAIN_REVIEW" | "REJECTED";

/** 지원자(또는 공무원)가 접수한 도서 1건 */
export type DocumentSubmission = {
  id: string;
  /** 1부터 — 1 = 최초 접수, 2~ = 보완 제출 */
  round: number;
  file: {
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
    storageKey: string;
    blobUrl?: string;
  };
  submittedAt: string;
  submittedBy: { id: string; name: string; role: RoleCode };
};

/** 사전심의 판정 (공무원) */
export type PreReviewDecision = {
  id: string;
  decision: "보완요청" | "반려" | "통과";
  note?: string;
  decidedAt: string;
  decidedBy: { id: string; name: string };
};

/** 본심의 심사위원 (계정 없음 — 공무원이 이름 마커를 골라 대신 입력) */
export type ReviewerMarker = {
  id: string;
  name: string;
  color: string;
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
  /** 프로젝트를 등록한 사용자 (지원자는 자기 프로젝트만 볼 수 있음) */
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  /** 심의 단계 (없으면 검토 기록 유무로 추정) */
  stage?: ProjectStage;
  /** 도서 접수·보완 제출 이력 */
  submissions?: DocumentSubmission[];
  /** 사전심의 판정 이력 */
  preReviewDecisions?: PreReviewDecision[];
  /** 본심의 심사위원 목록 */
  reviewers?: ReviewerMarker[];
  /** 휴지통으로 이동한 시각 (ISO). 설정되면 목록에서 숨깁니다. */
  deletedAt?: string;
  /** 데모 프로젝트 영구 삭제 표식 (ISO). 설정되면 데모 원본이 다시 병합되지 않습니다. */
  purgedAt?: string;
};
