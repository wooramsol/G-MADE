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

/**
 * 한 프로젝트를 행 잠금(SELECT … FOR UPDATE) 안에서 읽고-고치고-저장한다.
 * 서버 인스턴스가 여러 개여도 동시에 들어온 수정(예: 분석 결과 저장과 단계 변경)이 서로를 덮어쓰지 않는다.
 * 행이 없으면 "missing" — 호출 측이 기존 방식(데모 원본 병합 등)으로 처리.
 */
export async function updateManagedProjectAtomically(
  id: string,
  updater: (project: Project) => Project | null,
): Promise<Project | null | "missing"> {
  const prisma = getPrismaClient();
  if (!prisma) return "missing";
  await migrateStoredProjectsOnce();
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; data: Prisma.JsonValue; deleted_at: Date | null; updated_at: Date }>>`
        SELECT id, data, deleted_at, updated_at FROM managed_projects WHERE id = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row) return "missing" as const;
      const current = rowToProject({ id: row.id, data: row.data, deletedAt: row.deleted_at, updatedAt: row.updated_at });
      const next = updater(current);
      if (!next) return null;
      const deletedAt = next.deletedAt ? new Date(next.deletedAt) : null;
      await tx.managedProject.update({
        where: { id },
        data: { data: { ...next } as Prisma.InputJsonValue, deletedAt },
      });
      return next;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
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
