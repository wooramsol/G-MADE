import { mergeProjectWithLocal } from "./merge-project-state";
import { getProjectEvaluationRoundCount } from "./project-evaluation-status";
import { filterActiveProjects } from "./trash";
import type { Project } from "./types";

export type DashboardStats = {
  total: number;
  waiting: number;
  inEvaluation: number;
};

export function mergeManagedProjects(serverProjects: Project[], localProjects: Project[]): Project[] {
  const localById = new Map(localProjects.map((project) => [project.id, project]));
  const mergedServer = serverProjects.map((project) => {
    const local = localById.get(project.id);
    return local ? mergeProjectWithLocal(project, local) : project;
  });
  const serverIds = new Set(serverProjects.map((project) => project.id));
  const localOnly = localProjects.filter((project) => !serverIds.has(project.id));
  return filterActiveProjects(sortProjectsByReceivedAt([...mergedServer, ...localOnly]));
}

export function buildDashboardStats(projects: Project[]): DashboardStats {
  const waiting = projects.filter((project) => getProjectEvaluationRoundCount(project) === 0).length;
  const inEvaluation = projects.filter((project) => getProjectEvaluationRoundCount(project) > 0).length;

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
