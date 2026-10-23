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

/** 사전심의·본심의 작업(AI 분석·전문가 의견)이 가능한 단계인가 — 아직 도달하지 않은 단계·반려·철회는 불가 */
export function phaseWritable(project: Project, phase: ReviewPhase): boolean {
  const stage = projectStage(project);
  if (phase === "pre") return stage === "PRE_REVIEW" || stage === "MAIN_REVIEW" || stage === "CLOSED";
  return stage === "MAIN_REVIEW" || stage === "CLOSED";
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
