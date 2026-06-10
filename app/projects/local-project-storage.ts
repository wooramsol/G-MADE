"use client";

import type { HumanEvaluationSession, Project, ProjectFile, UploadAnalysisSession } from "@/lib/types";

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
  const nextProject = {
    ...project,
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };
  const nextProjects = [nextProject, ...projects.filter((item) => item.id !== project.id)];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
}

export function deleteLocalProject(projectId: string) {
  const projects = getLocalProjects().filter((project) => project.id !== projectId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

export function addLocalProjectFiles(projectId: string, files: ProjectFile[]): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    files: mergeProjectFiles(project.files, files),
    uploadAnalyses: project.uploadAnalyses ?? [],
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function syncLocalProjectAnalyses(
  projectId: string,
  baseProject: Project,
  files: ProjectFile[],
  uploadAnalyses: UploadAnalysisSession[],
): Project {
  const local = getLocalProjects().find((item) => item.id === projectId);
  const nextProject = {
    ...(local ?? baseProject),
    files,
    uploadAnalyses,
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function removeLocalProjectUploadAnalysis(projectId: string, sessionId: string): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    uploadAnalyses: (project.uploadAnalyses ?? []).filter((session) => session.id !== sessionId),
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function addLocalProjectUploadAnalysis(
  projectId: string,
  session: UploadAnalysisSession,
  files: ProjectFile[],
): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    files: mergeProjectFiles(project.files, files),
    uploadAnalyses: [...(project.uploadAnalyses ?? []), session],
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function syncLocalProjectEvaluations(
  projectId: string,
  baseProject: Project,
  files: ProjectFile[],
  uploadAnalyses: UploadAnalysisSession[],
  humanEvaluationSessions: HumanEvaluationSession[],
): Project {
  const local = getLocalProjects().find((item) => item.id === projectId);
  const nextProject = {
    ...(local ?? baseProject),
    files,
    uploadAnalyses,
    humanEvaluationSessions,
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function removeLocalProjectHumanEvaluation(
  projectId: string,
  sessionId: string,
): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    humanEvaluationSessions: (project.humanEvaluationSessions ?? []).filter(
      (session) => session.id !== sessionId,
    ),
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function addLocalProjectHumanEvaluation(
  projectId: string,
  session: HumanEvaluationSession,
  files: ProjectFile[],
): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    files: mergeProjectFiles(project.files, files),
    humanEvaluationSessions: [...(project.humanEvaluationSessions ?? []), session],
  };
  saveLocalProject(nextProject);
  return nextProject;
}
