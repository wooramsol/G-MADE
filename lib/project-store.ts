import { mkdir, readFile, writeFile } from "fs/promises";
import { projects as demoProjects } from "./demo-data";
import { sortProjectsByUpdatedAt } from "./project-sort";
import { getWritableStoragePath } from "./runtime-storage";
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
        }
      : project;
  });

  return sortProjectsByUpdatedAt([
    ...mergedDemoProjects,
    ...storedProjects.filter((project) => !demoProjectIds.has(project.id)),
  ]);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const allProjects = await getAllProjects();
  return allProjects.find((project) => project.id === id);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: `project-${Date.now()}`,
    ...input,
    status: "접수",
    files: [],
    updatedAt: now,
  };

  const createdProjects = await readCreatedProjects();
  await writeCreatedProjects([project, ...createdProjects]);

  return project;
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
  patch: Partial<Pick<Project, "name" | "location" | "locationPoint" | "client" | "designer" | "projectType" | "scale" | "reviewType" | "receivedAt" | "status">>,
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
  const allProjects = await getAllProjects();
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
    updatedAt: new Date().toISOString(),
  };

  if (storedIndex >= 0) {
    storedProjects[storedIndex] = nextProject;
  } else {
    storedProjects.unshift(nextProject);
  }

  await writeCreatedProjects(storedProjects);
  return nextProject;
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

export async function removeProjectEvaluationRound(
  id: string,
  roundId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    evaluationRounds: (project.evaluationRounds ?? []).filter((round) => round.id !== roundId),
  }));
}

async function updateStoredProject(
  id: string,
  updater: (project: Project) => Project,
): Promise<Project | undefined> {
  const allProjects = await getAllProjects();
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
    updatedAt: new Date().toISOString(),
  });

  if (storedIndex >= 0) {
    storedProjects[storedIndex] = nextProject;
  } else {
    storedProjects.unshift(nextProject);
  }

  await writeCreatedProjects(storedProjects);
  return nextProject;
}

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

export async function deleteCreatedProject(id: string): Promise<boolean> {
  if (isDemoProjectId(id)) return false;

  const createdProjects = await readCreatedProjects();
  const nextProjects = createdProjects.filter((project) => project.id !== id);

  if (nextProjects.length === createdProjects.length) {
    return false;
  }

  await writeCreatedProjects(nextProjects);
  return true;
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
  await writeFile(storePath, JSON.stringify(projects, null, 2));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
