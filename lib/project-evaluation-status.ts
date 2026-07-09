import type { Project } from "./types";

export type ProjectEvaluationStatusTone = "waiting" | "active";

export type ProjectEvaluationStatus = {
  label: string;
  tone: ProjectEvaluationStatusTone;
  reviewCount: number;
};

export function getProjectChecklistReviewCount(project: Project): number {
  return (project.checklistReviews ?? []).length;
}

export function getProjectEvaluationStatus(project: Project): ProjectEvaluationStatus {
  const reviewCount = getProjectChecklistReviewCount(project);

  if (reviewCount === 0) {
    return {
      label: "검토대기",
      tone: "waiting",
      reviewCount: 0,
    };
  }

  return {
    label: `검토완료(${reviewCount})`,
    tone: "active",
    reviewCount,
  };
}

export function evaluationStatusToneClassName(tone: ProjectEvaluationStatusTone): string {
  if (tone === "waiting") return "bg-slate-100 text-slate-700";
  return "bg-blue-50 text-blue-700";
}
