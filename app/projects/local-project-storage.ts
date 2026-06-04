"use client";

import type { Project, ProjectFile } from "@/lib/types";

const STORAGE_KEY = "gmadehive.localProjects";

export function getLocalProjects(): Project[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalProject(project: Project) {
  const projects = getLocalProjects();
  const nextProjects = [project, ...projects.filter((item) => item.id !== project.id)];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
}

export function deleteLocalProject(projectId: string) {
  const projects = getLocalProjects().filter((project) => project.id !== projectId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function addLocalProjectFiles(projectId: string, files: ProjectFile[]): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    files: [...project.files, ...files],
  };
  saveLocalProject(nextProject);
  return nextProject;
}
