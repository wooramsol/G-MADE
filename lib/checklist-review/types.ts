import type { EvaluationSpatialContext } from "@/lib/evaluation-context";

/** 체크리스트 항목별 평가 상태 (배점 없음). */
export type ChecklistItemStatus = "충족" | "부분충족" | "미충족" | "확인불가";

export const CHECKLIST_ITEM_STATUSES: ChecklistItemStatus[] = [
  "충족",
  "부분충족",
  "미충족",
  "확인불가",
];

export type ChecklistSourcePage = {
  fileName: string;
  page: number;
};

/** PDF '체크리스트' 페이지에서 추출한 개별 항목. */
export type ChecklistItem = {
  id: string;
  /** 체크리스트 내 구분(장·부문) 제목 */
  category?: string;
  /** 항목 원문 */
  text: string;
  source?: ChecklistSourcePage;
};

/** 페이지 왼쪽 위 기준 정규화 좌표(0~1)의 근거 위치 영역. */
export type EvidenceRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChecklistEvidence = {
  fileName: string;
  page: number;
  /** 해당 페이지에서 확인된 내용 (도면·이미지·본문) */
  note: string;
  /** 근거가 도면·이미지의 특정 위치일 때의 대략적 영역 (AI 추정, 근사치) */
  region?: EvidenceRegion;
};

export type ChecklistLawRef = {
  title: string;
  article?: string;
  sourceUrl?: string;
};

/** 항목별 AI 평가 결과. */
export type ChecklistFinding = {
  itemId: string;
  status: ChecklistItemStatus;
  /** 판단 근거 요약 */
  rationale: string;
  /** 문서 근거 (페이지 인용) */
  evidence: ChecklistEvidence[];
  /** 관련 법령·지침 (조회된 참조 내에서만) */
  lawRefs: ChecklistLawRef[];
  /** 공간정보(경관지구 등) 근거 */
  spatialNote?: string;
  /** 미충족·부분충족 시 보완 방향 */
  recommendation?: string;
};

export type ChecklistReviewFile = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storageKey?: string;
  blobUrl?: string;
  /** 원본 바이트의 sha256 해시 — 동일 파일 재업로드(중복 재분석) 감지에 사용 */
  contentHash?: string;
};

export type ChecklistStatusCounts = Record<ChecklistItemStatus, number>;

/** 문서에서 자동 추출한 사업 규모 지표 (원문 표기 그대로). */
export type ChecklistReviewMetric = {
  label: string;
  value: string;
  source?: ChecklistSourcePage;
};

/** 1회 체크리스트 검토 결과. */
export type ChecklistReview = {
  id: string;
  reviewedAt: string;
  files: ChecklistReviewFile[];
  /** 체크리스트로 인식된 페이지들 */
  checklistPages: ChecklistSourcePage[];
  items: ChecklistItem[];
  findings: ChecklistFinding[];
  counts: ChecklistStatusCounts;
  /** 문서에서 자동 추출한 사업 규모 지표 */
  metrics?: ChecklistReviewMetric[];
  /** 전체 총평 */
  summary: string;
  referenceLaws: Array<{ title: string; article: string; summary: string; sourceUrl: string }>;
  spatialContext: EvaluationSpatialContext | null;
  lawSource: "law.go.kr" | "demo-fallback";
  /** 항목 추출 경로: 텍스트 레이어(text) 또는 비전(vision) */
  itemSource: "text" | "vision";
  model: string;
  warnings: string[];
};

export function countFindingStatuses(findings: ChecklistFinding[]): ChecklistStatusCounts {
  const counts: ChecklistStatusCounts = { 충족: 0, 부분충족: 0, 미충족: 0, 확인불가: 0 };
  for (const finding of findings) {
    counts[finding.status] += 1;
  }
  return counts;
}

export function normalizeChecklistStatus(value: unknown): ChecklistItemStatus {
  const text = String(value ?? "").trim();
  if ((CHECKLIST_ITEM_STATUSES as string[]).includes(text)) {
    return text as ChecklistItemStatus;
  }
  if (/부분|일부/.test(text)) return "부분충족";
  if (/미충족|불충족|미반영|불이행/.test(text)) return "미충족";
  if (/충족|반영|이행|적합/.test(text)) return "충족";
  return "확인불가";
}
