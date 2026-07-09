import type { Project } from "./types";

export function isProjectTrashed(project: Pick<Project, "deletedAt">): boolean {
  return Boolean(project.deletedAt);
}

export function isProjectPurged(project: Pick<Project, "purgedAt">): boolean {
  return Boolean(project.purgedAt);
}

export function filterActiveProjects(projects: Project[]): Project[] {
  return projects.filter((project) => !isProjectTrashed(project));
}

export function filterTrashedProjects(projects: Project[]): Project[] {
  return projects.filter((project) => isProjectTrashed(project));
}
