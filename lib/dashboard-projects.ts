import { mergeProjectWithLocal } from "./merge-project-state";
import {
  getProjectEvaluationRoundCount,
  isProjectEvaluationComplete,
} from "./project-evaluation-status";
import type { Project } from "./types";

export type DashboardStats = {
  total: number;
  waiting: number;
  inEvaluation: number;
  completed: number;
};

export function mergeManagedProjects(serverProjects: Project[], localProjects: Project[]): Project[] {
  const localById = new Map(localProjects.map((project) => [project.id, project]));
  const mergedServer = serverProjects.map((project) => {
    const local = localById.get(project.id);
    return local ? mergeProjectWithLocal(project, local) : project;
  });
  const serverIds = new Set(serverProjects.map((project) => project.id));
  const localOnly = localProjects.filter((project) => !serverIds.has(project.id));
  return sortProjectsByReceivedAt([...mergedServer, ...localOnly]);
}

export function buildDashboardStats(projects: Project[]): DashboardStats {
  const completed = projects.filter((project) => isProjectEvaluationComplete(project)).length;
  const waiting = projects.filter(
    (project) => !isProjectEvaluationComplete(project) && getProjectEvaluationRoundCount(project) === 0,
  ).length;
  const inEvaluation = projects.filter(
    (project) => !isProjectEvaluationComplete(project) && getProjectEvaluationRoundCount(project) > 0,
  ).length;

  return {
    total: projects.length,
    waiting,
    inEvaluation,
    completed,
  };
}

export function getRecentProjects(projects: Project[], limit = 8): Project[] {
  return sortProjectsByReceivedAt(projects).slice(0, limit);
}

export function sortProjectsByReceivedAt(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
