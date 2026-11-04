import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { projects as demoProjects } from "./demo-data";
import {
  deleteManagedProjectFromDatabase,
  updateManagedProjectAtomically,
  readManagedProjectsFromDatabase,
  upsertManagedProjectToDatabase,
  writeManagedProjectsToDatabase,
} from "./project-db-persistence";
import { getPrismaClient, isDatabaseAvailable as probeDatabase } from "./prisma";

/**
 * 프로젝트 저장소로 DB를 쓰는가 — DB가 설정돼 있는데 잠깐 연결이 안 되면 임시 JSON 파일로
 * 빠지지 않고 오류로 처리한다(임시 파일에 저장된 내용은 사라지므로).
 */
async function isDatabaseAvailable(): Promise<boolean> {
  if (!getPrismaClient()) return false;
  if (await probeDatabase()) return true;
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (await probeDatabase()) return true;
  throw new Error("데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
}
import { withProjectStoreLock } from "./project-store-lock";
import { sortProjectsByUpdatedAt } from "./project-sort";
import { getWritableStoragePath } from "./runtime-storage";
import { isProjectPurged, isProjectTrashed } from "./trash";
import { mergeListChanges } from "./merge-list";
import { applicantCanWithdraw, applicantSubmissionKind, canSetStage, projectStage, type SubmissionKind } from "./roles";
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
  return updateStoredProject(id, (project) => {
    // 분석하는 동안 신청이 철회·반려됐으면 결과를 붙이지 않음
    const stage = projectStage(project);
    if (stage === "WITHDRAWN" || stage === "REJECTED") {
      throw new ProjectConflictError("분석 중 신청이 철회되었거나 반려되어 결과를 저장하지 않았습니다.");
    }
    return {
      ...project,
      files: mergeProjectFiles(project.files, files),
      checklistReviews: [...(project.checklistReviews ?? []), review],
    };
  });
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
  options: { asMain?: boolean; expectKind?: SubmissionKind; allowedStages?: ProjectStage[] } = {},
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    // 저장 직전 상태로 다시 확인 — 중복 클릭·동시 제출로 같은 단계에 두 번 내는 것 방지
    if (options.expectKind && applicantSubmissionKind(project) !== options.expectKind) return project;
    if (options.allowedStages && !options.allowedStages.includes(projectStage(project))) return project;
    // 같은 파일을 두 번 등록하지 않음 (동시 요청 포함)
    if ((project.submissions ?? []).some((entry) => entry.file.storageKey === submission.file.storageKey)) return project;
    const submissions = project.submissions ?? [];
    const next: Project = {
      ...project,
      files: mergeProjectFiles(project.files, [file]),
      submissions: [...submissions, { ...submission, round: submissions.length + 1 }],
    };
    if (projectStage(project) === "RECEPTION") {
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

/**
 * 저장 직전(행 잠금 안) 상태로 다시 확인했더니 요청이 더 이상 맞지 않을 때 — 동시에 다른 사람이 먼저 처리한 경우.
 * 이 오류가 나면 아무것도 저장되지 않는다. API는 409로 응답한다.
 */
export class ProjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectConflictError";
  }
}

/** 사전검토 판정 — 통과 → 사전심의(현재 최신 도서 기준), 반려 → 종료, 보완요청 → 사전검토 유지 */
export async function addPreReviewDecision(id: string, decision: PreReviewDecision): Promise<Project | undefined> {
  const nextStage: ProjectStage =
    decision.decision === "통과" ? "PRE_REVIEW" : decision.decision === "반려" ? "REJECTED" : "SCREENING";
  return updateStoredProject(id, (project) => {
    if (projectStage(project) !== "SCREENING") {
      throw new ProjectConflictError("이미 다른 사람이 판정했거나 단계가 바뀌었습니다. 화면을 새로고침해 주세요.");
    }
    const submissions = project.submissions ?? [];
    return {
      ...project,
      preReviewDecisions: [...(project.preReviewDecisions ?? []), decision],
      stage: nextStage,
      status: nextStage === "REJECTED" ? "완료" : "심사 진행중",
      ...(decision.decision === "통과"
        ? {
            preReviewSubmissionId: submissions[submissions.length - 1]?.id,
            // 되돌린 뒤 다시 통과한 경우 — 이전 회차의 결과 통보·본심의 도서 지정은 무효
            preReviewNotifiedAt: undefined,
            preReviewNote: undefined,
            mainReviewSubmissionId: undefined,
          }
        : {}),
    };
  });
}

/** 사전심의 결과 통보 — 지원자에게 본심의용 수정 도서 제출 요청 */
export async function notifyPreReviewResult(id: string, note: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    if (projectStage(project) !== "PRE_REVIEW") throw new ProjectConflictError("사전심의 단계에서만 결과를 통보할 수 있습니다.");
    if (project.preReviewNotifiedAt) throw new ProjectConflictError("이미 결과를 통보했습니다.");
    return { ...project, preReviewNotifiedAt: new Date().toISOString(), preReviewNote: note || undefined };
  });
}

/** 유관부서 태그 저장 — base를 주면 변경분만 병합 */
export async function setProjectDepartments(id: string, departments: string[], base?: string[]): Promise<Project | undefined> {
  const key = (name: string) => name.replace(/\s+/g, "");
  return updateStoredProject(id, (project) => ({
    ...project,
    departments: base ? mergeListChanges(project.departments ?? [], base, departments, key).slice(0, 30) : departments,
  }));
}

/**
 * 단계 직접 변경 (공무원 — 되돌리기·종료) — 허용 여부를 잠금 안에서 다시 확인.
 * 반환: 변경 전 단계와 변경된 프로젝트
 */
export async function setProjectStage(
  id: string,
  stage: ProjectStage,
): Promise<{ project: Project; previousStage: ProjectStage } | undefined> {
  let previousStage: ProjectStage = "RECEPTION";
  const project = await updateStoredProject(id, (current) => {
    previousStage = projectStage(current);
    if (!canSetStage(previousStage, stage)) {
      throw new ProjectConflictError("지금 단계에서는 그렇게 바꿀 수 없습니다. 화면을 새로고침해 주세요.");
    }
    if (previousStage === "PRE_REVIEW" && stage === "PRE_REVIEW") {
      if (!current.preReviewNotifiedAt) throw new ProjectConflictError("통보한 결과가 없습니다.");
      if (current.mainReviewSubmissionId) throw new ProjectConflictError("지원자가 이미 수정 도서를 제출했습니다.");
    }
    const next: Project = {
      ...current,
      stage,
      status: stage === "CLOSED" || stage === "REJECTED" ? "완료" : stage === "RECEPTION" ? "접수" : "심사 진행중",
    };
    // 되돌리면 그 뒤 단계의 진행 기록을 풀어 다시 진행할 수 있게 함 (도서·분석·의견 기록은 보존)
    if (stage === "SCREENING" || stage === "PRE_REVIEW") {
      next.preReviewNotifiedAt = undefined;
      next.preReviewNote = undefined;
      next.mainReviewSubmissionId = undefined;
    }
    return next;
  });
  return project ? { project, previousStage } : undefined;
}

/** 지원자 신청 취소 (도서 접수 전) — 휴지통으로. 그 사이 도서가 접수됐으면 취소하지 않음 */
export async function cancelApplicationBeforeSubmission(id: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    if ((project.submissions ?? []).length > 0) {
      throw new ProjectConflictError("이미 도서가 접수되었습니다. 화면을 새로고침한 뒤 '신청 철회'를 이용해 주세요.");
    }
    return { ...project, deletedAt: new Date().toISOString() };
  });
}

/** 지원자 신청 철회 (접수 후) */
export async function withdrawProjectApplication(id: string): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    if (!applicantCanWithdraw(project)) throw new ProjectConflictError("심의가 끝난 신청은 철회할 수 없습니다.");
    return {
      ...project,
      stage: "WITHDRAWN",
      withdrawnFromStage: projectStage(project),
      status: "완료",
      withdrawnAt: new Date().toISOString(),
    };
  });
}

/** 심사위원 목록 저장 — 사전심의(preReviewers) / 본심의(reviewers) 따로. base를 주면 변경분만 병합 */
export async function setProjectReviewers(
  id: string,
  reviewers: ReviewerMarker[],
  phase: ReviewPhase = "main",
  base?: ReviewerMarker[],
): Promise<Project | undefined> {
  return updateStoredProject(id, (project) => {
    const current = (phase === "pre" ? project.preReviewers : project.reviewers) ?? [];
    let next = base ? mergeListChanges(current, base, reviewers, (entry) => entry.id) : reviewers;
    // 병합 후에도 같은 이름은 한 명만 (먼저 있던 쪽 유지)
    const seenNames = new Set<string>();
    next = next.filter((entry) => {
      const key = entry.name.replace(/\s+/g, "").toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    }).slice(0, 40);
    return phase === "pre" ? { ...project, preReviewers: next } : { ...project, reviewers: next };
  });
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

  // 프로젝트마다 잠금 안에서 따로 비움 — 동시에 진행 중인 다른 수정이 덮어써지지 않도록
  const allProjects = await getAllProjectsIncludingTrashed();
  let projectsUpdated = 0;
  for (const source of allProjects) {
    if (isProjectPurged(source) || excluded.has(source.id)) continue;
    if ((source.checklistReviews ?? []).length === 0) continue;
    const updated = await updateStoredProject(source.id, (project) => ({ ...project, checklistReviews: [] }));
    if (updated) projectsUpdated += 1;
  }
  return { projectsUpdated };
}

async function updateStoredProject(
  id: string,
  updater: (project: Project) => Project,
): Promise<Project | undefined> {
  return withProjectStoreLock(async () => {
    // DB에 저장된 프로젝트는 행 잠금으로 원자적으로 갱신 (인스턴스 간 동시 수정 덮어쓰기 방지)
    if (await isDatabaseAvailable()) {
      const atomic = await updateManagedProjectAtomically(id, (stored) => {
        if (isProjectPurged(stored)) return null;
        return updater({ ...stored, checklistReviews: stored.checklistReviews ?? [], updatedAt: new Date().toISOString() });
      });
      if (atomic !== "missing") return atomic ?? undefined;
    }

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
      // DB 사용 중에는 예전 JSON 파일을 절대 건드리지 않음 (전체 덮어쓰기 위험)
      return deleteManagedProjectFromDatabase(id);
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
    // DB가 비어 있어도 예전 JSON 파일을 다시 들여오지 않음 (지운 프로젝트가 되살아나는 것 방지)
    return readManagedProjectsFromDatabase();
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
