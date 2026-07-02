import { mkdir, readFile, rename, writeFile } from "fs/promises";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./prisma";
import { getWritableStoragePath } from "./runtime-storage";
import type { Project } from "./types";

/**
 * 프로젝트 스냅샷 영속성 백엔드.
 *
 * - Postgres(stored_projects 테이블)가 연결되어 있으면 DB가 source of truth.
 *   행 단위 upsert/delete로 서버리스 다중 인스턴스에서도 lost update가 발생하지 않는다.
 * - DB가 없으면 기존 JSON 파일 저장소로 동작한다 (로컬 개발·데모용).
 *   Vercel에서는 /tmp 경로라 재배포 시 사라지므로 운영에는 DB 연결이 필요하다.
 */

const storeDir = getWritableStoragePath();
const storePath = getWritableStoragePath("projects.json");

const DB_CHECK_TTL_MS = 60_000;

const globalState = globalThis as unknown as {
  __projectDbCache?: { value: boolean; checkedAt: number };
  __projectFileMigrationDone?: boolean;
};

async function isProjectDbAvailable(): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) return false;

  const cache = globalState.__projectDbCache;
  const now = Date.now();
  if (cache && now - cache.checkedAt < DB_CHECK_TTL_MS) {
    return cache.value;
  }

  try {
    // 테이블 존재 여부까지 함께 검증한다 (db push 미실행 환경 대비).
    await prisma.storedProject.count();
    globalState.__projectDbCache = { value: true, checkedAt: now };
    return true;
  } catch {
    globalState.__projectDbCache = { value: false, checkedAt: now };
    return false;
  }
}

/** 파일 저장소에 남아 있던 프로젝트를 DB로 1회 이관한다 (로컬 → DB 전환 시). */
async function migrateFileProjectsToDbOnce(): Promise<void> {
  if (globalState.__projectFileMigrationDone) return;
  globalState.__projectFileMigrationDone = true;

  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    const dbCount = await prisma.storedProject.count();
    if (dbCount > 0) return;

    const fileProjects = await readFileProjects();
    if (fileProjects.length === 0) return;

    for (const project of fileProjects) {
      await prisma.storedProject.upsert({
        where: { id: project.id },
        update: {
          payload: project as unknown as Prisma.InputJsonValue,
          deletedAt: project.deletedAt ? new Date(project.deletedAt) : null,
        },
        create: {
          id: project.id,
          payload: project as unknown as Prisma.InputJsonValue,
          deletedAt: project.deletedAt ? new Date(project.deletedAt) : null,
        },
      });
    }
  } catch {
    // 이관 실패는 치명적이지 않다. 다음 요청에서 파일 저장소로 계속 동작한다.
  }
}

export async function readStoredProjects(): Promise<Project[]> {
  if (await isProjectDbAvailable()) {
    await migrateFileProjectsToDbOnce();
    const prisma = getPrismaClient()!;
    const rows = await prisma.storedProject.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => row.payload as unknown as Project);
  }

  return readFileProjects();
}

export async function putStoredProject(project: Project): Promise<void> {
  if (await isProjectDbAvailable()) {
    const prisma = getPrismaClient()!;
    const data = {
      payload: project as unknown as Prisma.InputJsonValue,
      deletedAt: project.deletedAt ? new Date(project.deletedAt) : null,
    };
    await prisma.storedProject.upsert({
      where: { id: project.id },
      update: data,
      create: { id: project.id, ...data },
    });
    return;
  }

  const projects = await readFileProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    projects[index] = project;
  } else {
    projects.unshift(project);
  }
  await writeFileProjects(projects);
}

export async function deleteStoredProjectById(id: string): Promise<boolean> {
  if (await isProjectDbAvailable()) {
    const prisma = getPrismaClient()!;
    try {
      await prisma.storedProject.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  const projects = await readFileProjects();
  const nextProjects = projects.filter((project) => project.id !== id);
  if (nextProjects.length === projects.length) {
    return false;
  }
  await writeFileProjects(nextProjects);
  return true;
}

/** 프로젝트·평가 데이터가 DB에 영속 저장되는지 여부 (통합 상태 표시용). */
export async function isProjectStoragePersistent(): Promise<boolean> {
  return isProjectDbAvailable();
}

async function readFileProjects(): Promise<Project[]> {
  try {
    const content = await readFile(storePath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function writeFileProjects(projects: Project[]): Promise<void> {
  await mkdir(storeDir, { recursive: true });
  const tempPath = `${storePath}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(projects, null, 2), "utf8");
  await rename(tempPath, storePath);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
