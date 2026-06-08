import type { Project } from "./types";

export function getProjectUpdatedAt(project: Project): number {
  if (project.updatedAt) {
    const parsed = Date.parse(project.updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }

  const idMatch = project.id.match(/^project-(\d+)$/);
  if (idMatch) {
    return Number(idMatch[1]);
  }

  const receivedAt = Date.parse(project.receivedAt);
  return Number.isFinite(receivedAt) ? receivedAt : 0;
}

export function sortProjectsByUpdatedAt(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => getProjectUpdatedAt(right) - getProjectUpdatedAt(left));
}
