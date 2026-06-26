import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { projects as demoProjects } from "./demo-data";
import { withProjectStoreLock } from "./project-store-lock";
import { sortProjectsByUpdatedAt } from "./project-sort";
import { getWritableStoragePath } from "./runtime-storage";
import {
  isProjectTrashed,
  purgeEvaluationRound,
  restoreEvaluationRound,
  trashEvaluationRound,
} from "./trash";
import type {
  EvaluationRound,
  HumanEvaluationSession,
  Project,
  ProjectFile,
  UploadAnalysisSession,
} from "./types";

type ProjectInput = Omit<Project, "id" | "status" | "files">;

const storeDir = getWritableStoragePath();
const storePath = getWritableStoragePath("projects.json");
const demoProjectIds = new Set(demoProjects.map((project) => project.id));

export function isDemoProjectId(id: string): boolean {
  return demoProjectIds.has(id);
}

export function isCreatedProjectId(id: string): boolean {
  return !isDemoProjectId(id);
}

export async function getAllProjects(): Promise<Project[]> {
  const allProjects = await getAllProjectsIncludingTrashed();
  return allProjects.filter((project) => !isProjectTrashed(project));
}

export async function getTrashedProjects(): Promise<Project[]> {
  const allProjects = await getAllProjectsIncludingTrashed();
  return allProjects.filter((project) => isProjectTrashed(project));
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const project = await getProjectRecordById(id);
  if (!project || isProjectTrashed(project)) return undefined;
  return project;
}

export async function getProjectRecordById(id: string): Promise<Project | undefined> {
  const allProjects = await getAllProjectsIncludingTrashed();
  return allProjects.find((project) => project.id === id);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  return withProjectStoreLock(async () => {
    const now = new Date().toISOString();
    const project: Project = {
      id: `project-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      ...input,
      status: "접수",
      files: [],
      evaluationRounds: [],
      trashedEvaluationRounds: [],
      updatedAt: now,
    };

    const createdProjects = await readCreatedProjects();
    await writeCreatedProjects([project, ...createdProjects]);

    return project;
  });
}

export async function addProjectFiles(id: string, files: ProjectFile[]): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: mergeProjectFiles(project.files, files),
  }));
}

export async function addProjectUploadAnalysis(
  id: string,
  session: UploadAnalysisSession,
  files: ProjectFile[],
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: mergeProjectFiles(project.files, files),
    uploadAnalyses: [...(project.uploadAnalyses ?? []), session],
  }));
}

export async function updateProject(
  id: string,
  patch: Partial<
    Pick<
      Project,
      | "name"
      | "location"
      | "locationPoint"
      | "client"
      | "designer"
      | "projectType"
      | "scale"
      | "reviewType"
      | "receivedAt"
      | "summary"
      | "status"
      | "savedEvaluationItems"
    >
  >,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    ...patch,
  }));
}

export async function removeProjectUploadAnalysis(
  id: string,
  sessionId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    uploadAnalyses: (project.uploadAnalyses ?? []).filter((session) => session.id !== sessionId),
  }));
}

export async function addProjectHumanEvaluationSession(
  id: string,
  session: HumanEvaluationSession,
  files: ProjectFile[],
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: mergeProjectFiles(project.files, files),
    humanEvaluationSessions: [...(project.humanEvaluationSessions ?? []), session],
  }));
}

export async function removeProjectHumanEvaluationSession(
  id: string,
  sessionId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    humanEvaluationSessions: (project.humanEvaluationSessions ?? []).filter(
      (session) => session.id !== sessionId,
    ),
  }));
}

export async function upsertProjectRecord(project: Project): Promise<Project> {
  return withProjectStoreLock(async () => {
    const allProjects = await getAllProjectsIncludingTrashed();
    const existing = allProjects.find((item) => item.id === project.id);
    const storedProjects = await readCreatedProjects();
    const storedIndex = storedProjects.findIndex((item) => item.id === project.id);
    const base = existing ?? project;

    const nextProject: Project = {
      ...base,
      ...project,
      files: project.files ?? base.files ?? [],
      uploadAnalyses: project.uploadAnalyses ?? base.uploadAnalyses ?? [],
      humanEvaluationSessions: project.humanEvaluationSessions ?? base.humanEvaluationSessions ?? [],
      evaluationRounds: project.evaluationRounds ?? base.evaluationRounds ?? [],
      trashedEvaluationRounds: project.trashedEvaluationRounds ?? base.trashedEvaluationRounds ?? [],
      savedEvaluationItems: project.savedEvaluationItems ?? base.savedEvaluationItems,
      updatedAt: new Date().toISOString(),
    };

    if (storedIndex >= 0) {
      storedProjects[storedIndex] = nextProject;
    } else {
      storedProjects.unshift(nextProject);
    }

    await writeCreatedProjects(storedProjects);
    return nextProject;
  });
}

export async function addProjectEvaluationRound(
  id: string,
  round: EvaluationRound,
  files: ProjectFile[],
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: mergeProjectFiles(project.files, files),
    evaluationRounds: [...(project.evaluationRounds ?? []), round],
  }));
}

/** 평가 차수를 휴지통으로 이동합니다. */
export async function trashProjectEvaluationRound(
  id: string,
  roundId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const result = trashEvaluationRound(
      project.evaluationRounds ?? [],
      project.trashedEvaluationRounds ?? [],
      roundId,
    );

    if (!result) return project;

    return {
      ...project,
      evaluationRounds: result.activeRounds,
      trashedEvaluationRounds: result.trashedRounds,
    };
  });
}

/** @deprecated trashProjectEvaluationRound를 사용하세요. */
export async function removeProjectEvaluationRound(
  id: string,
  roundId: string,
): Promise<Project | undefined> {
  return trashProjectEvaluationRound(id, roundId);
}

export async function restoreProjectEvaluationRound(
  id: string,
  roundId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const result = restoreEvaluationRound(
      project.evaluationRounds ?? [],
      project.trashedEvaluationRounds ?? [],
      roundId,
    );

    if (!result) return project;

    return {
      ...project,
      evaluationRounds: result.activeRounds,
      trashedEvaluationRounds: result.trashedRounds,
    };
  });
}

export async function purgeProjectEvaluationRound(
  id: string,
  roundId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const nextTrashed = purgeEvaluationRound(project.trashedEvaluationRounds ?? [], roundId);
    if (!nextTrashed) return project;

    return {
      ...project,
      trashedEvaluationRounds: nextTrashed,
    };
  });
}

/** 모든 프로젝트의 평가 차수(활성·휴지통)를 영구 삭제합니다. 데모 프로젝트는 저장소 오버레이로 비웁니다. */
export async function purgeAllProjectEvaluationRounds(): Promise<{ projectsUpdated: number }> {
  return withProjectStoreLock(async () => {
    const allProjects = await getAllProjectsIncludingTrashed();
    const storedProjects = await readCreatedProjects();
    const storedById = new Map(storedProjects.map((project) => [project.id, project]));
    let projectsUpdated = 0;

    for (const project of allProjects) {
      const hasRounds =
        (project.evaluationRounds?.length ?? 0) > 0 ||
        (project.trashedEvaluationRounds?.length ?? 0) > 0;
      if (!hasRounds) continue;

      const updatedAt = new Date().toISOString();
      const stored = storedById.get(project.id);

      storedById.set(project.id, {
        ...(stored ?? project),
        evaluationRounds: [],
        trashedEvaluationRounds: [],
        updatedAt,
      });

      projectsUpdated += 1;
    }

    if (projectsUpdated > 0) {
      await writeCreatedProjects(Array.from(storedById.values()));
    }

    return { projectsUpdated };
  });
}

async function updateStoredProject(
  id: string,
  updater: (project: Project) => Project,
): Promise<Project | undefined> {
  return withProjectStoreLock(async () => {
    const allProjects = await getAllProjectsIncludingTrashed();
    const existingProject = allProjects.find((project) => project.id === id);

    if (!existingProject) return undefined;

    const storedProjects = await readCreatedProjects();
    const storedIndex = storedProjects.findIndex((project) => project.id === id);
    const baseProject = storedIndex >= 0 ? storedProjects[storedIndex] : existingProject;
    const nextProject = updater({
      ...baseProject,
      uploadAnalyses: baseProject.uploadAnalyses ?? [],
      humanEvaluationSessions: baseProject.humanEvaluationSessions ?? [],
      evaluationRounds: baseProject.evaluationRounds ?? [],
      trashedEvaluationRounds: baseProject.trashedEvaluationRounds ?? [],
      updatedAt: new Date().toISOString(),
    });

    if (storedIndex >= 0) {
      storedProjects[storedIndex] = nextProject;
    } else {
      storedProjects.unshift(nextProject);
    }

    await writeCreatedProjects(storedProjects);
    return nextProject;
  });
}

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

/** 프로젝트를 휴지통으로 이동합니다. */
export async function trashProjectRecord(id: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    deletedAt: new Date().toISOString(),
  }));
}

/** 휴지통에서 프로젝트를 복원합니다. */
export async function restoreProjectRecord(id: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const nextProject = { ...project };
    delete nextProject.deletedAt;
    return nextProject;
  });
}

/** JSON 저장소의 원본 프로젝트 레코드를 조회합니다. (데모 병합 없음) */
export async function getStoredProjectRecord(id: string): Promise<Project | undefined> {
  const storedProjects = await readCreatedProjects();
  return storedProjects.find((project) => project.id === id);
}

/** 저장소에서 프로젝트 레코드를 영구 삭제합니다. */
export async function purgeProjectRecord(id: string): Promise<boolean> {
  return withProjectStoreLock(async () => {
    const createdProjects = await readCreatedProjects();
    const nextProjects = createdProjects.filter((project) => project.id !== id);

    if (nextProjects.length === createdProjects.length) {
      return false;
    }

    await writeCreatedProjects(nextProjects);
    return true;
  });
}

export async function deleteCreatedProject(id: string): Promise<boolean> {
  const trashed = await trashProjectRecord(id);
  return Boolean(trashed);
}

/** @deprecated trashProjectRecord 또는 purgeProjectRecord를 사용하세요. */
export async function deleteProjectRecord(id: string): Promise<boolean> {
  const trashed = await trashProjectRecord(id);
  return Boolean(trashed);
}

async function getAllProjectsIncludingTrashed(): Promise<Project[]> {
  const storedProjects = await readCreatedProjects();
  const storedById = new Map(storedProjects.map((project) => [project.id, project]));
  const mergedDemoProjects = demoProjects.map((project) => {
    const stored = storedById.get(project.id);
    return stored
      ? {
          ...project,
          ...stored,
          files: stored.files ?? project.files,
          uploadAnalyses: stored.uploadAnalyses ?? project.uploadAnalyses ?? [],
          humanEvaluationSessions:
            stored.humanEvaluationSessions ?? project.humanEvaluationSessions ?? [],
          evaluationRounds: stored.evaluationRounds ?? project.evaluationRounds ?? [],
          trashedEvaluationRounds: stored.trashedEvaluationRounds ?? project.trashedEvaluationRounds ?? [],
          savedEvaluationItems: stored.savedEvaluationItems ?? project.savedEvaluationItems,
        }
      : project;
  });

  const activeStored = storedProjects.filter((project) => !demoProjectIds.has(project.id));

  return sortProjectsByUpdatedAt([...mergedDemoProjects, ...activeStored]);
}

async function readCreatedProjects(): Promise<Project[]> {
  try {
    const content = await readFile(storePath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function writeCreatedProjects(projects: Project[]) {
  await mkdir(storeDir, { recursive: true });
  const tempPath = `${storePath}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(projects, null, 2), "utf8");
  await rename(tempPath, storePath);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
