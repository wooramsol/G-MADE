"use client";

import {
  filterActiveProjects,
  filterTrashedProjects,
  purgeEvaluationRound,
  restoreEvaluationRound,
  trashEvaluationRound,
} from "@/lib/trash";
import { mergeProjectWithLocal } from "@/lib/merge-project-state";
import type {
  EvaluationItem,
  EvaluationRound,
  HumanEvaluationSession,
  Project,
  ProjectFile,
  UploadAnalysisSession,
} from "@/lib/types";

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

export function getActiveLocalProjects(): Project[] {
  return filterActiveProjects(getLocalProjects());
}

export function getTrashedLocalProjects(): Project[] {
  return filterTrashedProjects(getLocalProjects());
}

export function saveLocalProject(project: Project) {
  try {
    const projects = getLocalProjects();
    const nextProject = {
      ...project,
      updatedAt: project.updatedAt ?? new Date().toISOString(),
    };
    const nextProjects = [nextProject, ...projects.filter((item) => item.id !== project.id)];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProjects));
  } catch {
    // localStorage quota/private mode — 서버 동기화에만 의존합니다.
  }
}

export function trashLocalProject(projectId: string): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = {
    ...project,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function restoreLocalProject(projectId: string): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextProject = { ...project, updatedAt: new Date().toISOString() };
  delete nextProject.deletedAt;
  saveLocalProject(nextProject);
  return nextProject;
}

export function purgeLocalProject(projectId: string) {
  const projects = getLocalProjects().filter((project) => project.id !== projectId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

/** @deprecated trashLocalProject를 사용하세요. */
export function deleteLocalProject(projectId: string) {
  trashLocalProject(projectId);
}

export function trashLocalProjectRound(projectId: string, roundId: string): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const result = trashEvaluationRound(
    project.evaluationRounds ?? [],
    project.trashedEvaluationRounds ?? [],
    roundId,
  );
  if (!result) return undefined;

  const nextProject = {
    ...project,
    evaluationRounds: result.activeRounds,
    trashedEvaluationRounds: result.trashedRounds,
    updatedAt: new Date().toISOString(),
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function restoreLocalProjectRound(projectId: string, roundId: string): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const result = restoreEvaluationRound(
    project.evaluationRounds ?? [],
    project.trashedEvaluationRounds ?? [],
    roundId,
  );
  if (!result) return undefined;

  const nextProject = {
    ...project,
    evaluationRounds: result.activeRounds,
    trashedEvaluationRounds: result.trashedRounds,
    updatedAt: new Date().toISOString(),
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function purgeLocalProjectRound(projectId: string, roundId: string): Project | undefined {
  const projects = getLocalProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return undefined;

  const nextTrashed = purgeEvaluationRound(project.trashedEvaluationRounds ?? [], roundId);
  if (!nextTrashed) return undefined;

  const nextProject = {
    ...project,
    trashedEvaluationRounds: nextTrashed,
    updatedAt: new Date().toISOString(),
  };
  saveLocalProject(nextProject);
  return nextProject;
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

export function saveLocalProjectEvaluationItems(
  projectId: string,
  baseProject: Project,
  savedEvaluationItems: EvaluationItem[],
): Project {
  const local = getLocalProjects().find((item) => item.id === projectId);
  const nextProject = {
    ...(local ?? baseProject),
    savedEvaluationItems,
    updatedAt: new Date().toISOString(),
  };
  saveLocalProject(nextProject);
  return nextProject;
}

export function syncLocalProjectRounds(
  projectId: string,
  baseProject: Project,
  files: ProjectFile[],
  evaluationRounds: EvaluationRound[],
  trashedEvaluationRounds?: EvaluationRound[],
): Project {
  const local = getLocalProjects().find((item) => item.id === projectId);
  const nextProject = {
    ...(local ?? baseProject),
    files,
    evaluationRounds,
    trashedEvaluationRounds:
      trashedEvaluationRounds ?? local?.trashedEvaluationRounds ?? baseProject.trashedEvaluationRounds ?? [],
  };
  saveLocalProject(nextProject);
  return nextProject;
}

function roundsSignature(rounds: EvaluationRound[]): string {
  return rounds.map((round) => round.id).join(",");
}

/** 서버 상태를 기준으로 브라우저에 남은 삭제·휴지통 평가 차수를 정리합니다. */
export function reconcileLocalProjectsWithServer(serverProjects: Project[]): boolean {
  const localById = new Map(getLocalProjects().map((project) => [project.id, project]));
  let changed = false;

  for (const serverProject of serverProjects) {
    const local = localById.get(serverProject.id);
    if (!local) continue;

    const merged = mergeProjectWithLocal(serverProject, local);
    const nextActive = merged.evaluationRounds ?? [];
    const nextTrashed = merged.trashedEvaluationRounds ?? [];
    const prevActive = local.evaluationRounds ?? [];
    const prevTrashed = local.trashedEvaluationRounds ?? [];

    if (
      roundsSignature(prevActive) === roundsSignature(nextActive) &&
      roundsSignature(prevTrashed) === roundsSignature(nextTrashed)
    ) {
      continue;
    }

    syncLocalProjectRounds(serverProject.id, merged, merged.files, nextActive, nextTrashed);
    changed = true;
  }

  return changed;
}

/** 브라우저 저장소의 모든 평가 차수(활성·휴지통)를 비웁니다. */
export function purgeAllLocalEvaluationRounds(): void {
  const projects = getLocalProjects().map((project) => ({
    ...project,
    evaluationRounds: [],
    trashedEvaluationRounds: [],
    updatedAt: new Date().toISOString(),
  }));

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // localStorage quota/private mode
  }
}
