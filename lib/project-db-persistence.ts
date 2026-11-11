import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "./prisma";
import type { ChecklistReview } from "./checklist-review/types";
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

type ReviewRow = { id: string; projectId: string; data: Prisma.JsonValue; reviewedAt: Date };
type Tx = Prisma.TransactionClient;

/**
 * 분석 결과 테이블(managed_project_reviews) 사용 가능 여부.
 * 배포 때 테이블 생성이 실패했더라도 서비스가 멈추지 않도록, 없으면 예전 방식(프로젝트 본문에 함께 저장)으로 동작한다.
 */
const reviewTableState = globalThis as unknown as { __reviewTableReady?: boolean; __reviewTableCheckedAt?: number };
async function reviewTableReady(): Promise<boolean> {
  if (reviewTableState.__reviewTableReady) return true;
  if (Date.now() - (reviewTableState.__reviewTableCheckedAt ?? 0) < 60_000) return false;
  reviewTableState.__reviewTableCheckedAt = Date.now();
  const prisma = getPrismaClient();
  if (!prisma) return false;
  try {
    await prisma.managedProjectReview.count();
    reviewTableState.__reviewTableReady = true;
    return true;
  } catch (error) {
    console.warn("[project-db] 분석 결과 테이블을 쓸 수 없어 프로젝트 본문 저장 방식으로 동작:", error instanceof Error ? error.message : error);
    return false;
  }
}

function reviewTime(review: ChecklistReview): number {
  const time = Date.parse(review.reviewedAt);
  return Number.isFinite(time) ? time : 0;
}

/** 본문에 남아 있는 예전 분석 결과 + 테이블의 분석 결과를 합쳐(같은 id는 테이블 우선) 시간순으로 */
function withReviews(project: Project, rows: ReviewRow[]): { project: Project; tableReviews: Map<string, ChecklistReview> } {
  const tableReviews = new Map<string, ChecklistReview>();
  for (const row of rows) tableReviews.set(row.id, row.data as unknown as ChecklistReview);
  const merged = new Map<string, ChecklistReview>();
  for (const review of project.checklistReviews ?? []) if (review?.id) merged.set(review.id, review);
  for (const [id, review] of tableReviews) merged.set(id, review);
  const checklistReviews = [...merged.values()].sort((a, b) => reviewTime(a) - reviewTime(b));
  return { project: { ...project, checklistReviews }, tableReviews };
}

/**
 * 프로젝트 저장 — 분석 결과는 회차별 행으로, 본문에는 분석 결과를 빼고 저장.
 * unchanged에 있는 객체와 동일한(안 바뀐) 회차는 다시 쓰지 않는다.
 */
async function saveProject(tx: Tx, project: Project, unchanged: Map<string, ChecklistReview> | null, useTable: boolean): Promise<void> {
  const deletedAt = project.deletedAt ? new Date(project.deletedAt) : null;
  if (!useTable) {
    const data = { ...project } as Prisma.InputJsonValue;
    await tx.managedProject.upsert({ where: { id: project.id }, create: { id: project.id, data, deletedAt }, update: { data, deletedAt } });
    return;
  }
  const reviews = (project.checklistReviews ?? []).filter((review) => review?.id);
  const data = { ...project, checklistReviews: [] } as unknown as Prisma.InputJsonValue;
  await tx.managedProject.upsert({ where: { id: project.id }, create: { id: project.id, data, deletedAt }, update: { data, deletedAt } });
  const keepIds = reviews.map((review) => review.id);
  await tx.managedProjectReview.deleteMany({ where: { projectId: project.id, ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}) } });
  for (const review of reviews) {
    if (unchanged?.get(review.id) === review) continue;
    const reviewData = review as unknown as Prisma.InputJsonValue;
    const reviewedAt = new Date(reviewTime(review) || Date.now());
    await tx.managedProjectReview.upsert({
      where: { id: review.id },
      create: { id: review.id, projectId: project.id, data: reviewData, reviewedAt },
      update: { projectId: project.id, data: reviewData, reviewedAt },
    });
  }
}

export async function readManagedProjectsFromDatabase(): Promise<Project[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  await migrateStoredProjectsOnce();

  const rows = await prisma.managedProject.findMany({
    orderBy: { updatedAt: "desc" },
  });
  const reviewRows: ReviewRow[] = (await reviewTableReady()) ? await prisma.managedProjectReview.findMany() : [];
  const byProject = new Map<string, ReviewRow[]>();
  for (const row of reviewRows) byProject.set(row.projectId, [...(byProject.get(row.projectId) ?? []), row]);

  return rows.map((row) => withReviews(rowToProject(row), byProject.get(row.id) ?? []).project);
}

/** 프로젝트 1건만 읽기 — 전체 프로젝트를 불러오지 않는다 */
export async function readManagedProjectFromDatabase(id: string): Promise<Project | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  await migrateStoredProjectsOnce();
  const row = await prisma.managedProject.findUnique({ where: { id } });
  if (!row) return null;
  const reviewRows: ReviewRow[] = (await reviewTableReady()) ? await prisma.managedProjectReview.findMany({ where: { projectId: id } }) : [];
  return withReviews(rowToProject(row), reviewRows).project;
}

export async function writeManagedProjectsToDatabase(projects: Project[]): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const nextIds = projects.map((project) => project.id);
  const useTable = await reviewTableReady();

  await prisma.$transaction(async (tx) => {
    if (nextIds.length === 0) {
      await tx.managedProject.deleteMany();
      return;
    }

    await tx.managedProject.deleteMany({
      where: { id: { notIn: nextIds } },
    });

    for (const project of projects) await saveProject(tx, project, null, useTable);
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
  const useTable = await reviewTableReady();
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; data: Prisma.JsonValue; deleted_at: Date | null; updated_at: Date }>>`
        SELECT id, data, deleted_at, updated_at FROM managed_projects WHERE id = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row) return "missing" as const;
      const reviewRows: ReviewRow[] = useTable ? await tx.managedProjectReview.findMany({ where: { projectId: id } }) : [];
      const { project: current, tableReviews } = withReviews(
        rowToProject({ id: row.id, data: row.data, deletedAt: row.deleted_at, updatedAt: row.updated_at }),
        reviewRows,
      );
      const next = updater(current);
      if (!next) return null;
      // 안 바뀐 회차는 다시 쓰지 않음 (본문에만 있던 예전 회차는 이때 테이블로 옮겨짐)
      await saveProject(tx, next, tableReviews, useTable);
      return next;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function upsertManagedProjectToDatabase(project: Project): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const useTable = await reviewTableReady();
  await prisma.$transaction(async (tx) => saveProject(tx, project, null, useTable), { maxWait: 10_000, timeout: 30_000 });
}

export async function deleteManagedProjectFromDatabase(id: string): Promise<boolean> {
  const prisma = getPrismaClient();
  if (!prisma) return false;

  if (await reviewTableReady()) await prisma.managedProjectReview.deleteMany({ where: { projectId: id } });
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
