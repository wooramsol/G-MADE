import { getProjectEvaluationRounds } from "./evaluation-rounds";
import type { Project } from "./types";

export type ProjectEvaluationStatusTone = "waiting" | "active";

export type ProjectEvaluationStatus = {
  label: string;
  tone: ProjectEvaluationStatusTone;
  roundCount: number;
};

export function getProjectEvaluationRoundCount(project: Project): number {
  return getProjectEvaluationRounds(project).length;
}

export function getProjectEvaluationStatus(project: Project): ProjectEvaluationStatus {
  const roundCount = getProjectEvaluationRoundCount(project);

  if (roundCount === 0) {
    return {
      label: "평가대기",
      tone: "waiting",
      roundCount: 0,
    };
  }

  return {
    label: `평가중(${roundCount})`,
    tone: "active",
    roundCount,
  };
}

export function evaluationStatusToneClassName(tone: ProjectEvaluationStatusTone): string {
  if (tone === "waiting") return "bg-slate-100 text-slate-700";
  return "bg-blue-50 text-blue-700";
}
