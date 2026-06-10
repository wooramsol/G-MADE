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
  return tone === "waiting" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-700";
}
