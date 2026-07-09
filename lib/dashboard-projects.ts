import { getProjectChecklistReviewCount } from "./project-evaluation-status";
import type { Project } from "./types";

export type DashboardStats = {
  total: number;
  waiting: number;
  inEvaluation: number;
};

export function buildDashboardStats(projects: Project[]): DashboardStats {
  const waiting = projects.filter((project) => getProjectChecklistReviewCount(project) === 0).length;
  const inEvaluation = projects.filter((project) => getProjectChecklistReviewCount(project) > 0).length;

  return {
    total: projects.length,
    waiting,
    inEvaluation,
  };
}

export function getRecentProjects(projects: Project[], limit = 8): Project[] {
  return sortProjectsByReceivedAt(projects).slice(0, limit);
}

export function sortProjectsByReceivedAt(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
