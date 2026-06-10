import { getProjectEvaluationRounds } from "./evaluation-rounds";
import { getProjectEvaluationRoundCount } from "./project-evaluation-status";
import type { Project } from "./types";

export type DashboardStats = {
  waiting: number;
  inEvaluation: number;
  total: number;
  averageScore: number | null;
};

export function mergeManagedProjects(serverProjects: Project[], localProjects: Project[]): Project[] {
  const serverIds = new Set(serverProjects.map((project) => project.id));
  const localOnly = localProjects.filter((project) => !serverIds.has(project.id));
  return sortProjectsByReceivedAt([...serverProjects, ...localOnly]);
}

export function buildDashboardStats(projects: Project[]): DashboardStats {
  const waiting = projects.filter((project) => getProjectEvaluationRoundCount(project) === 0).length;
  const inEvaluation = projects.filter((project) => getProjectEvaluationRoundCount(project) > 0).length;

  return {
    waiting,
    inEvaluation,
    total: projects.length,
    averageScore: getEvaluationAverageScore(projects),
  };
}

export function getRecentProjects(projects: Project[], limit = 8): Project[] {
  return sortProjectsByReceivedAt(projects).slice(0, limit);
}

function getEvaluationAverageScore(projects: Project[]): number | null {
  const scores = projects.flatMap((project) =>
    getProjectEvaluationRounds(project).flatMap((round) =>
      round.aiAnalysis.evaluationPreview.map((row) => row.score),
    ),
  );

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function sortProjectsByReceivedAt(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
