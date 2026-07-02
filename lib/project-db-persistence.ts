import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./prisma";
import type { Project } from "./types";

function rowToProject(row: {
  id: string;
  data: Prisma.JsonValue;
  deletedAt: Date | null;
  updatedAt: Date;
}): Project {
  const stored = row.data as Project;
  return {
    ...stored,
    id: row.id,
    deletedAt: row.deletedAt?.toISOString() ?? stored.deletedAt,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const globalState = globalThis as unknown as {
  __storedProjectsMigrationDone?: boolean;
};

/**
 * 과도기(PR #68~#69) 동안 stored_projects 테이블에 기록된 프로젝트를
 * managed_projects로 1회 이관한다. 더 최신 updatedAt을 가진 쪽을 우선한다.
 */
async function migrateStoredProjectsOnce(): Promise<void> {
  if (globalState.__storedProjectsMigrationDone) return;
  globalState.__storedProjectsMigrationDone = true;

  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    const storedRows = await prisma.storedProject.findMany();
    if (storedRows.length === 0) return;

    for (const row of storedRows) {
      const project = row.payload as unknown as Project;
      if (!project?.id) continue;

      const existing = await prisma.managedProject.findUnique({ where: { id: row.id } });
      if (existing && existing.updatedAt >= row.updatedAt) continue;

      await upsertManagedProjectToDatabase({
        ...project,
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    // 이중 저장 방지: 이관 완료 후 과도기 테이블은 비운다.
    await prisma.storedProject.deleteMany();
  } catch {
    // stored_projects 테이블이 없거나 이관 실패 시 기존 데이터로 계속 동작한다.
  }
}

export async function readManagedProjectsFromDatabase(): Promise<Project[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  await migrateStoredProjectsOnce();

  const rows = await prisma.managedProject.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return rows.map(rowToProject);
}

export async function writeManagedProjectsToDatabase(projects: Project[]): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const nextIds = projects.map((project) => project.id);

  await prisma.$transaction(async (tx) => {
    if (nextIds.length === 0) {
      await tx.managedProject.deleteMany();
      return;
    }

    await tx.managedProject.deleteMany({
      where: { id: { notIn: nextIds } },
    });

    for (const project of projects) {
      const deletedAt = project.deletedAt ? new Date(project.deletedAt) : null;
      const data = { ...project } as Prisma.InputJsonValue;

      await tx.managedProject.upsert({
        where: { id: project.id },
        create: {
          id: project.id,
          data,
          deletedAt,
        },
        update: {
          data,
          deletedAt,
        },
      });
    }
  });
}

export async function upsertManagedProjectToDatabase(project: Project): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const deletedAt = project.deletedAt ? new Date(project.deletedAt) : null;
  const data = { ...project } as Prisma.InputJsonValue;

  await prisma.managedProject.upsert({
    where: { id: project.id },
    create: {
      id: project.id,
      data,
      deletedAt,
    },
    update: {
      data,
      deletedAt,
    },
  });
}

export async function deleteManagedProjectFromDatabase(id: string): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) return false;

  const result = await prisma.managedProject.deleteMany({ where: { id } });
  return result.count > 0;
}

/** 프로젝트·평가 데이터가 DB에 영속 저장되는지 여부 (통합 상태 표시용). */
export async function isProjectStoragePersistent(): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) return false;

  try {
    await prisma.managedProject.count();
    return true;
  } catch {
    return false;
  }
}
