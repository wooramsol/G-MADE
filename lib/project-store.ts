import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { projects as demoProjects } from "./demo-data";
import type { Project } from "./types";

type ProjectInput = Omit<Project, "id" | "status" | "files">;

const storePath = path.join(process.cwd(), "storage", "projects.json");
const demoProjectIds = new Set(demoProjects.map((project) => project.id));

export function isDemoProjectId(id: string): boolean {
  return demoProjectIds.has(id);
}

export function isCreatedProjectId(id: string): boolean {
  return !isDemoProjectId(id);
}

export async function getAllProjects(): Promise<Project[]> {
  const createdProjects = await readCreatedProjects();
  return [...demoProjects, ...createdProjects.filter((project) => !demoProjectIds.has(project.id))];
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const allProjects = await getAllProjects();
  return allProjects.find((project) => project.id === id);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const project: Project = {
    id: `project-${Date.now()}`,
    ...input,
    status: "접수",
    files: [],
  };

  const createdProjects = await readCreatedProjects();
  await writeCreatedProjects([project, ...createdProjects]);

  return project;
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
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(projects, null, 2));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
