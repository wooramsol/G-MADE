import { getProjectEvaluationRounds } from "./evaluation-rounds";
import type { Project } from "./types";

export type ProjectEvaluationStatusTone = "waiting" | "active" | "completed";

export type ProjectEvaluationStatus = {
  label: string;
  tone: ProjectEvaluationStatusTone;
  roundCount: number;
};

export function isProjectEvaluationComplete(project: Project): boolean {
  return project.status === "완료";
}

export function getProjectEvaluationRoundCount(project: Project): number {
  return getProjectEvaluationRounds(project).length;
}

export function getProjectEvaluationStatus(project: Project): ProjectEvaluationStatus {
  const roundCount = getProjectEvaluationRoundCount(project);

  if (isProjectEvaluationComplete(project)) {
    return {
      label: "평가완료",
      tone: "completed",
      roundCount,
    };
  }

  if (roundCount === 0) {
    return {
      label: "평가대기 중",
      tone: "waiting",
      roundCount: 0,
    };
  }

  return {
    label: `평가 중(${roundCount}건)`,
    tone: "active",
    roundCount,
  };
}

export function evaluationStatusToneClassName(tone: ProjectEvaluationStatusTone): string {
  if (tone === "completed") return "bg-emerald-50 text-emerald-800";
  if (tone === "waiting") return "bg-slate-100 text-slate-700";
  return "bg-blue-50 text-blue-700";
}
