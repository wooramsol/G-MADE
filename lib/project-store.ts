import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { projects as demoProjects } from "./demo-data";
import {
  deleteManagedProjectFromDatabase,
  readManagedProjectsFromDatabase,
  upsertManagedProjectToDatabase,
  writeManagedProjectsToDatabase,
} from "./project-db-persistence";
import { isDatabaseAvailable } from "./prisma";
import { withProjectStoreLock } from "./project-store-lock";
import { sortProjectsByUpdatedAt } from "./project-sort";
import { getWritableStoragePath } from "./runtime-storage";
import { isProjectPurged, isProjectTrashed } from "./trash";
import type { ChecklistReview } from "./checklist-review/types";
import type { DocumentSubmission, ExpertMemo, PreReviewDecision, Project, ProjectFile, ProjectStage, ReviewerMarker, ReviewPhase } from "./types";

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
      checklistReviews: [],
      updatedAt: now,
    };

    await persistProjectRecord(project);
    return project;
  });
}

export async function addProjectFiles(id: string, files: ProjectFile[]): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: mergeProjectFiles(project.files, files),
  }));
}

export async function removeProjectFile(id: string, fileId: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: project.files.filter((file) => file.id !== fileId),
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
    >
  >,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    ...patch,
  }));
}

export async function upsertProjectRecord(project: Project): Promise<Project> {
  return withProjectStoreLock(async () => {
    const allProjects = await getAllProjectsIncludingTrashed();
    const existing = allProjects.find((item) => item.id === project.id);
    const base = existing ?? project;

    const nextProject: Project = {
      ...base,
      ...project,
      files: project.files ?? base.files ?? [],
      checklistReviews: project.checklistReviews ?? base.checklistReviews ?? [],
      updatedAt: new Date().toISOString(),
    };

    await persistProjectRecord(nextProject);
    return nextProject;
  });
}

export async function addProjectChecklistReview(
  id: string,
  review: ChecklistReview,
  files: ProjectFile[],
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    files: mergeProjectFiles(project.files, files),
    checklistReviews: [...(project.checklistReviews ?? []), review],
  }));
}

/** 검토 기록의 특정 항목 코멘트를 저장(빈 문자열이면 삭제)합니다. */
export async function updateProjectChecklistReviewComment(
  id: string,
  reviewId: string,
  itemId: string,
  comment: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    checklistReviews: (project.checklistReviews ?? []).map((review) => {
      if (review.id !== reviewId) return review;
      const comments = { ...(review.comments ?? {}) };
      if (comment) {
        comments[itemId] = comment;
      } else {
        delete comments[itemId];
      }
      return { ...review, comments };
    }),
  }));
}

/** 도서 버전 이름 저장 (빈 이름이면 자동 이름으로 되돌림). */
export async function updateProjectDocumentVersionLabel(
  id: string,
  versionKey: string,
  label: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const labels = { ...(project.documentVersionLabels ?? {}) };
    if (label) labels[versionKey] = label;
    else delete labels[versionKey];
    return { ...project, documentVersionLabels: labels };
  });
}

/** 프로젝트 JSON 안의 전문가 메모 교체 (R2 미사용 환경·이관용 — 평소엔 expert-memo-store가 R2에 따로 저장) */
export async function setProjectExpertMemos(id: string, memos: ExpertMemo[]): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({ ...project, expertMemos: memos }));
}

/**
 * 도서 접수 기록
 * - 최초 접수 → 2단계 사전검토
 * - asMain(사전심의 결과 통보 후 수정 도서) → 4단계 본심의 대상 도서로 지정
 */
export async function addProjectSubmission(
  id: string,
  submission: Omit<DocumentSubmission, "round">,
  file: ProjectFile,
  options: { asMain?: boolean } = {},
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const submissions = project.submissions ?? [];
    const next: Project = {
      ...project,
      files: mergeProjectFiles(project.files, [file]),
      submissions: [...submissions, { ...submission, round: submissions.length + 1 }],
    };
    if (!project.stage || project.stage === "RECEPTION") {
      next.stage = "SCREENING";
      next.status = "심사 진행중";
    }
    if (options.asMain) {
      next.stage = "MAIN_REVIEW";
      next.mainReviewSubmissionId = submission.id;
      next.status = "심사 진행중";
    }
    return next;
  });
}

/** 사전검토 판정 — 통과 → 사전심의(현재 최신 도서 기준), 반려 → 종료, 보완요청 → 사전검토 유지 */
export async function addPreReviewDecision(id: string, decision: PreReviewDecision): Promise<Project | undefined> {
  const nextStage: ProjectStage =
    decision.decision === "통과" ? "PRE_REVIEW" : decision.decision === "반려" ? "REJECTED" : "SCREENING";
  return updateStoredProject(id, (project) => {
    const submissions = project.submissions ?? [];
    return {
      ...project,
      preReviewDecisions: [...(project.preReviewDecisions ?? []), decision],
      stage: nextStage,
      status: nextStage === "REJECTED" ? "완료" : "심사 진행중",
      ...(decision.decision === "통과" ? { preReviewSubmissionId: submissions[submissions.length - 1]?.id } : {}),
    };
  });
}

/** 사전심의 결과 통보 — 지원자에게 본심의용 수정 도서 제출 요청 */
export async function notifyPreReviewResult(id: string, note: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    preReviewNotifiedAt: new Date().toISOString(),
    preReviewNote: note || undefined,
  }));
}

/** 유관부서 태그 저장 */
export async function setProjectDepartments(id: string, departments: string[]): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({ ...project, departments }));
}

/** 단계 직접 변경 (공무원 — 판정 되돌리기 등) */
export async function setProjectStage(id: string, stage: ProjectStage): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    stage,
    status: stage === "CLOSED" || stage === "REJECTED" ? "완료" : stage === "RECEPTION" ? "접수" : "심사 진행중",
  }));
}

/** 지원자 신청 철회 (접수 후) */
export async function withdrawProjectApplication(id: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    stage: "WITHDRAWN",
    status: "완료",
    withdrawnAt: new Date().toISOString(),
  }));
}

/** 심사위원 목록 저장 — 사전심의(preReviewers) / 본심의(reviewers) 따로 */
export async function setProjectReviewers(
  id: string,
  reviewers: ReviewerMarker[],
  phase: ReviewPhase = "main",
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => (phase === "pre" ? { ...project, preReviewers: reviewers } : { ...project, reviewers }));
}

/** 프로젝트의 체크리스트 검토 기록을 영구 삭제합니다. */
export async function clearProjectChecklistReviews(id: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    if ((project.checklistReviews ?? []).length === 0) {
      return project;
    }

    return {
      ...project,
      checklistReviews: [],
    };
  });
}

/** 개별 체크리스트 검토 기록을 삭제합니다. */
export async function removeProjectChecklistReview(
  id: string,
  reviewId: string,
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => ({
    ...project,
    checklistReviews: (project.checklistReviews ?? []).filter((review) => review.id !== reviewId),
  }));
}

/** 검토 기록 여러 건을 한 번에 삭제합니다. (관리 모드 다중 선택 삭제) */
export async function removeProjectChecklistReviews(
  id: string,
  reviewIds: string[],
): Promise<Project | undefined> {
  const idSet = new Set(reviewIds);
  return updateStoredProject(id, (project) => ({
    ...project,
    checklistReviews: (project.checklistReviews ?? []).filter((review) => !idSet.has(review.id)),
  }));
}

/**
 * 모든 프로젝트의 체크리스트 검토 기록을 영구 삭제합니다. 데모 프로젝트는 저장소 오버레이로 비웁니다.
 * excludeProjectIds에 지정한 프로젝트의 기록은 유지합니다.
 */
export async function purgeAllProjectChecklistReviews(options?: {
  excludeProjectIds?: string[];
}): Promise<{ projectsUpdated: number }> {
  const excluded = new Set(options?.excludeProjectIds ?? []);

  return withProjectStoreLock(async () => {
    const allProjects = await getAllProjectsIncludingTrashed();
    const updatedAt = new Date().toISOString();
    let projectsUpdated = 0;

    for (const source of allProjects) {
      if (isProjectPurged(source)) continue;
      if (excluded.has(source.id)) continue;

      if ((source.checklistReviews ?? []).length === 0) continue;

      const nextProject: Project = {
        ...source,
        checklistReviews: [],
        updatedAt,
      };

      await persistProjectRecord(nextProject);
      projectsUpdated += 1;
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

    if (!existingProject || isProjectPurged(existingProject)) return undefined;

    const storedProjects = await readCreatedProjects();
    const storedIndex = storedProjects.findIndex((project) => project.id === id);
    const baseProject = storedIndex >= 0 ? storedProjects[storedIndex] : existingProject;
    const nextProject = updater({
      ...baseProject,
      checklistReviews: baseProject.checklistReviews ?? [],
      updatedAt: new Date().toISOString(),
    });

    await persistProjectRecord(nextProject);
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
    if (isDemoProjectId(id)) {
      return purgeDemoProjectRecord(id);
    }

    if (await isDatabaseAvailable()) {
      const deleted = await deleteManagedProjectFromDatabase(id);
      if (deleted) return true;
    }

    const createdProjects = await readCreatedProjectsFromJsonFile();
    const nextProjects = createdProjects.filter((project) => project.id !== id);

    if (nextProjects.length === createdProjects.length) {
      return false;
    }

    await writeCreatedProjects(nextProjects);
    return true;
  });
}

async function purgeDemoProjectRecord(id: string): Promise<boolean> {
  const demoProject = demoProjects.find((project) => project.id === id);
  if (!demoProject) return false;

  const storedProjects = await readCreatedProjects();
  const stored = storedProjects.find((project) => project.id === id);
  const purgedAt = new Date().toISOString();
  const tombstone: Project = {
    ...demoProject,
    ...(stored ?? {}),
    purgedAt,
    deletedAt: undefined,
    checklistReviews: [],
    updatedAt: purgedAt,
  };

  await persistProjectRecord(tombstone);
  return true;
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
  const mergedDemoProjects = demoProjects
    .filter((project) => !isProjectPurged(storedById.get(project.id) ?? project))
    .map((project) => {
      const stored = storedById.get(project.id);
      return stored
        ? {
            ...project,
            ...stored,
            files: stored.files ?? project.files,
            checklistReviews: pickStoredArrayField<ChecklistReview>(stored, "checklistReviews"),
          }
        : project;
    });

  const activeStored = storedProjects.filter(
    (project) => !demoProjectIds.has(project.id) && !isProjectPurged(project),
  );

  return sortProjectsByUpdatedAt([...mergedDemoProjects, ...activeStored]).map(normalizeProjectEvaluationState);
}

function normalizeProjectEvaluationState(project: Project): Project {
  return {
    ...project,
    checklistReviews: project.checklistReviews ?? [],
  };
}

function pickStoredArrayField<T>(
  stored: Project,
  key: "checklistReviews",
): T[] {
  if (!(key in stored)) return [];
  const value = stored[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

async function persistProjectRecord(project: Project): Promise<void> {
  if (await isDatabaseAvailable()) {
    await upsertManagedProjectToDatabase(project);
    return;
  }

  const storedProjects = await readCreatedProjectsFromJsonFile();
  const storedIndex = storedProjects.findIndex((item) => item.id === project.id);
  if (storedIndex >= 0) {
    storedProjects[storedIndex] = project;
  } else {
    storedProjects.unshift(project);
  }
  await writeCreatedProjectsToJsonFile(storedProjects);
}

async function readCreatedProjects(): Promise<Project[]> {
  if (await isDatabaseAvailable()) {
    const fromDatabase = await readManagedProjectsFromDatabase();
    if (fromDatabase.length > 0) {
      return fromDatabase;
    }

    const fromJson = await readCreatedProjectsFromJsonFile();
    if (fromJson.length > 0) {
      await writeManagedProjectsToDatabase(fromJson);
      return fromJson;
    }

    return [];
  }

  return readCreatedProjectsFromJsonFile();
}

async function readCreatedProjectsFromJsonFile(): Promise<Project[]> {
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
  if (await isDatabaseAvailable()) {
    await writeManagedProjectsToDatabase(projects);
    return;
  }

  await writeCreatedProjectsToJsonFile(projects);
}

async function writeCreatedProjectsToJsonFile(projects: Project[]) {
  await mkdir(storeDir, { recursive: true });
  const tempPath = `${storePath}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(projects, null, 2), "utf8");
  await rename(tempPath, storePath);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
