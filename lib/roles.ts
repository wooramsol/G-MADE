import type { Project, ProjectStage, RoleCode } from "./types";

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

/** 단계 — 저장값이 없으면 검토 기록·접수 여부로 추정 (기존 프로젝트 호환) */
export function projectStage(project: Project): ProjectStage {
  if (project.stage) return project.stage;
  if ((project.checklistReviews ?? []).length > 0 || (project.submissions ?? []).length > 0) return "PRE_REVIEW";
  return "RECEPTION";
}

export const STAGE_LABELS: Record<ProjectStage, string> = {
  RECEPTION: "도서접수",
  PRE_REVIEW: "사전심의",
  MAIN_REVIEW: "본심의",
  REJECTED: "반려",
};

/** 목록·헤더용 상태 문구 */
export function projectStageStatus(project: Project): string {
  const stage = projectStage(project);
  if (stage !== "PRE_REVIEW") return STAGE_LABELS[stage];
  const decisions = project.preReviewDecisions ?? [];
  const last = decisions[decisions.length - 1];
  const submissions = project.submissions ?? [];
  const lastSubmission = submissions[submissions.length - 1];
  if (last?.decision === "보완요청") {
    return lastSubmission && lastSubmission.submittedAt > last.decidedAt ? "사전심의 · 보완 제출됨" : "사전심의 · 보완 요청";
  }
  return "사전심의";
}

/** 지원자가 지금 도서를 올릴 수 있는가 — 최초 접수 전, 또는 보완 요청을 받은 뒤 */
export function applicantCanSubmit(project: Project): boolean {
  const stage = projectStage(project);
  const submissions = project.submissions ?? [];
  if (stage === "RECEPTION") return true;
  if (stage !== "PRE_REVIEW") return false;
  if (submissions.length === 0) return true;
  const decisions = project.preReviewDecisions ?? [];
  const last = decisions[decisions.length - 1];
  return last?.decision === "보완요청";
}
