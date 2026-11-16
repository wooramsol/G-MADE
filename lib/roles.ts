import type { DocumentSubmission, Project, ProjectStage, ReviewPhase, RoleCode } from "./types";

/** 공무원 권한 (모든 단계 진행) — 관리자·공무원·과거 심사위원 계정 */
export function isOfficialRole(role: RoleCode | undefined | null): boolean {
  return role === "ADMIN" || role === "OFFICER" || role === "REVIEWER";
}

export function isApplicantRole(role: RoleCode | undefined | null): boolean {
  return role === "APPLICANT";
}

/** 지원자는 자기가 등록한 프로젝트만, 공무원은 전부 */
export function canAccessProject(user: { id?: string; role?: RoleCode } | undefined | null, project: Project): boolean {
  if (!user) return false;
  if (isOfficialRole(user.role)) return true;
  return Boolean(project.ownerId && user.id && project.ownerId === user.id);
}

/** 단계 — 저장값이 없으면 접수·검토 기록으로 추정 (기존 프로젝트 호환) */
export function projectStage(project: Project): ProjectStage {
  if (project.stage) return project.stage;
  if ((project.checklistReviews ?? []).length > 0) return "PRE_REVIEW";
  if ((project.submissions ?? []).length > 0) return "SCREENING";
  return "RECEPTION";
}

export const STAGE_LABELS: Record<ProjectStage, string> = {
  RECEPTION: "도서접수",
  SCREENING: "사전검토",
  PRE_REVIEW: "사전심의",
  MAIN_REVIEW: "본심의",
  CLOSED: "심의종료",
  REJECTED: "반려",
  WITHDRAWN: "신청 철회",
};

function lastOf<T>(list: T[] | undefined): T | undefined {
  return list && list.length > 0 ? list[list.length - 1] : undefined;
}

/** 진행 순서 — 1 도서접수 · 2 사전검토 · 3 사전심의 · 4 본심의 · 5 심의종료 */
export const STAGE_ORDER: ProjectStage[] = ["RECEPTION", "SCREENING", "PRE_REVIEW", "MAIN_REVIEW", "CLOSED"];
export type ProgressStep = 1 | 2 | 3 | 4 | 5;

/** 진행 표시용 단계 번호 — 반려는 사전검토(2), 철회는 철회 당시 단계에 표시 */
export function projectProgressStep(project: Project): ProgressStep {
  const stage = projectStage(project);
  const effective = stage === "WITHDRAWN" ? (project.withdrawnFromStage ?? "SCREENING") : stage;
  const index = STAGE_ORDER.indexOf(effective);
  return (index >= 0 ? index + 1 : 2) as ProgressStep;
}

/**
 * 단계가 바뀌었으면 새 단계에 들어선 시각을 기록한다 (저장 직전에 호출).
 * 되돌린 경우 그 뒤 단계의 기록은 지워서, 다시 진행했을 때의 시각이 남게 한다.
 * 되돌아간 단계 자체의 시각은 건드리지 않는다 — 그 값은 앞 단계의 완료 시각이라, 덮어쓰면
 * 예컨대 본심의 → 사전심의로 되돌렸을 때 '사전검토 완료 시각'이 되돌린 시각으로 바뀌어 버린다.
 */
export function recordStageChange(before: Project, after: Project, now: string = new Date().toISOString()): Project {
  const from = projectStage(before);
  const to = projectStage(after);
  if (from === to) return after;
  const toIndex = STAGE_ORDER.indexOf(to);
  if (toIndex < 0) return after; // 반려·철회 — 진행 단계가 아니므로 기록하지 않음
  const entered: Partial<Record<ProjectStage, string>> = { ...(after.stageEnteredAt ?? {}) };
  for (const later of STAGE_ORDER.slice(toIndex + 1)) delete entered[later];
  const fromIndex = STAGE_ORDER.indexOf(from);
  // 앞으로 나아간 경우에만 기록 (반려 취소·되돌리기는 기존 시각 유지)
  if (fromIndex >= 0 && toIndex > fromIndex) entered[to] = now;
  return { ...after, stageEnteredAt: entered };
}

/**
 * 단계(1~4)가 완료된 시각 = 다음 단계에 들어선 시각.
 * 기록이 없는 예전 프로젝트는 접수·판정·수정 도서 제출 시각으로 추정한다 (본심의 종료 시각은 추정할 수 없어 비움).
 */
export function stepCompletedAt(project: Project, step: 1 | 2 | 3 | 4): string | undefined {
  const recorded = project.stageEnteredAt?.[STAGE_ORDER[step]];
  if (recorded) return recorded;
  if (step === 1) return project.submissions?.[0]?.submittedAt;
  if (step === 2) return lastOf((project.preReviewDecisions ?? []).filter((entry) => entry.decision === "통과"))?.decidedAt;
  if (step === 3) return (project.submissions ?? []).find((entry) => entry.id === project.mainReviewSubmissionId)?.submittedAt;
  return undefined;
}

/** 사전검토에서 보완 요청 후 아직 보완 도서를 안 냈는가 */
function awaitingScreeningRevision(project: Project): boolean {
  const last = lastOf(project.preReviewDecisions);
  if (last?.decision !== "보완요청") return false;
  const lastSubmission = lastOf(project.submissions);
  return !lastSubmission || lastSubmission.submittedAt < last.decidedAt;
}

/** 목록·헤더용 상태 문구 */
export function projectStageStatus(project: Project): string {
  const stage = projectStage(project);
  if (stage === "CLOSED") return "심의종료 · 결과 통지 예정";
  if (stage === "SCREENING") {
    const last = lastOf(project.preReviewDecisions);
    if (last?.decision === "보완요청") return awaitingScreeningRevision(project) ? "사전검토 · 보완 요청" : "사전검토 · 보완 제출됨";
    return "사전검토";
  }
  if (stage === "PRE_REVIEW" && project.preReviewNotifiedAt) return "사전심의 완료 · 수정 도서 제출 대기";
  return STAGE_LABELS[stage];
}

/** 기본정보 수정 — 공무원은 언제나, 지원자는 도서 접수 전까지만 */
export function canEditProjectInfo(user: { role?: RoleCode } | undefined | null, project: Project): boolean {
  if (isOfficialRole(user?.role)) return true;
  return projectStage(project) === "RECEPTION" && (project.submissions ?? []).length === 0;
}

/** 지원자가 신청을 취소(접수 전)·철회(접수 후)할 수 있는가 */
export function applicantCanWithdraw(project: Project): boolean {
  const stage = projectStage(project);
  return stage === "RECEPTION" || stage === "SCREENING" || stage === "PRE_REVIEW" || stage === "MAIN_REVIEW";
}

/** 지원자가 지금 낼 수 있는 도서 종류 (없으면 null) */
export type SubmissionKind = "initial" | "revision" | "main";
export function applicantSubmissionKind(project: Project): SubmissionKind | null {
  const stage = projectStage(project);
  const submissions = project.submissions ?? [];
  if (stage === "RECEPTION") return submissions.length === 0 ? "initial" : null;
  if (stage === "SCREENING") return awaitingScreeningRevision(project) ? "revision" : null;
  // 사전심의 결과 통보 후, 본심의용 수정 도서 1회
  if (stage === "PRE_REVIEW" && project.preReviewNotifiedAt && !project.mainReviewSubmissionId) return "main";
  return null;
}

export function applicantCanSubmit(project: Project): boolean {
  return applicantSubmissionKind(project) !== null;
}

/**
 * 공무원의 단계 직접 변경 — 정해진 되돌리기·종료만 허용 (임의 건너뛰기 차단)
 * - 본심의 → 심의종료 / 심의종료 → 본심의(재개)
 * - 본심의 → 사전심의, 사전심의(통보 후) → 사전심의(통보 취소)
 * - 사전심의·본심의·심의종료·반려 → 사전검토 (철회된 신청은 되살리지 않음)
 */
export function canSetStage(from: ProjectStage, to: ProjectStage): boolean {
  if (to === "CLOSED") return from === "MAIN_REVIEW";
  if (to === "MAIN_REVIEW") return from === "CLOSED";
  if (to === "PRE_REVIEW") return from === "MAIN_REVIEW" || from === "PRE_REVIEW";
  if (to === "SCREENING") return from === "PRE_REVIEW" || from === "MAIN_REVIEW" || from === "CLOSED" || from === "REJECTED";
  return false;
}

/**
 * 사전심의·본심의 작업(AI 분석·전문가 의견)이 가능한 단계인가 — 그 단계가 진행 중일 때만.
 * 아직 도달하지 않은 단계·반려·철회는 불가, 다음 단계로 넘어간 뒤에는 잠금(열람만).
 * 단계를 되돌리면(본심의 → 사전심의, 심의종료 → 본심의) 다시 작업할 수 있다.
 */
export function phaseWritable(project: Project, phase: ReviewPhase): boolean {
  const stage = projectStage(project);
  return phase === "pre" ? stage === "PRE_REVIEW" : stage === "MAIN_REVIEW";
}

/** 단계가 끝났는가 — 사전심의: 본심의로 넘어감, 본심의: 심의종료 */
export function phaseCompleted(project: Project, phase: ReviewPhase): boolean {
  const stage = projectStage(project);
  return phase === "pre" ? stage === "MAIN_REVIEW" || stage === "CLOSED" : stage === "CLOSED";
}

/** 단계별 심사 대상 도서 — 사전심의: 사전검토 통과본, 본심의: 수정 도서 */
export function phaseSubmission(project: Project, phase: ReviewPhase): DocumentSubmission | undefined {
  const submissions = project.submissions ?? [];
  const id = phase === "pre" ? project.preReviewSubmissionId : project.mainReviewSubmissionId;
  const found = id ? submissions.find((entry) => entry.id === id) : undefined;
  if (found) return found;
  // 과거 프로젝트 호환 — 사전심의는 최신 접수본으로
  if (phase === "pre" && !project.mainReviewSubmissionId) return lastOf(submissions);
  return undefined;
}

/**
 * 지원자에게 보낼 프로젝트 데이터 — 내부 심의 자료(AI 분석·심사위원·전문가 의견·유관부서 등)는 제외.
 * 화면에서 숨기는 것만으로는 브라우저로 전달된 데이터에 남으므로 서버에서 걸러 보낸다.
 */
export function projectForViewer(project: Project, official: boolean): Project {
  if (official) return project;
  const submissionFileIds = new Set((project.submissions ?? []).map((entry) => entry.file.id));
  return {
    ...project,
    files: (project.files ?? []).filter((file) => submissionFileIds.has(file.id)),
    checklistReviews: [],
    expertMemos: undefined,
    reviewers: undefined,
    preReviewers: undefined,
    departments: undefined,
    documentVersionLabels: undefined,
    analysisLock: undefined,
  };
}

/** 분석 잠금 유효 시간 — 서버 실행 한도(300초)보다 조금 길게 */
export const ANALYSIS_LOCK_MS = 330_000;

/** 지금 AI 분석이 진행 중인가 (오래된 잠금은 무시) */
export function activeAnalysisLock(project: Pick<Project, "analysisLock">, now = Date.now()): Project["analysisLock"] | null {
  const lock = project.analysisLock;
  if (!lock) return null;
  const startedAt = Date.parse(lock.startedAt);
  return Number.isFinite(startedAt) && now - startedAt < ANALYSIS_LOCK_MS ? lock : null;
}
