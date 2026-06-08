import type { Project } from "./types";

export type DashboardStats = {
  received: number;
  inReview: number;
  completed: number;
  total: number;
  averageScore: number | null;
};

export function mergeManagedProjects(serverProjects: Project[], localProjects: Project[]): Project[] {
  const serverIds = new Set(serverProjects.map((project) => project.id));
  const localOnly = localProjects.filter((project) => !serverIds.has(project.id));
  return sortProjectsByReceivedAt([...serverProjects, ...localOnly]);
}

export function buildDashboardStats(projects: Project[]): DashboardStats {
  const received = projects.filter((project) => project.status === "접수").length;
  const inReview = projects.filter((project) => project.status === "심사 진행중").length;
  const completed = projects.filter((project) => project.status === "완료").length;

  return {
    received,
    inReview,
    completed,
    total: projects.length,
    averageScore: getUploadAnalysisAverageScore(projects),
  };
}

export function getRecentProjects(projects: Project[], limit = 8): Project[] {
  return sortProjectsByReceivedAt(projects).slice(0, limit);
}

function getUploadAnalysisAverageScore(projects: Project[]): number | null {
  const scores = projects.flatMap((project) =>
    (project.uploadAnalyses ?? []).flatMap((session) =>
      session.analysis.evaluationPreview.map((row) => row.score),
    ),
  );

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function sortProjectsByReceivedAt(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
