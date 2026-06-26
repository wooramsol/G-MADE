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

export async function readManagedProjectsFromDatabase(): Promise<Project[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

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

export async function deleteManagedProjectFromDatabase(id: string): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) return false;

  const result = await prisma.managedProject.deleteMany({ where: { id } });
  return result.count > 0;
}
