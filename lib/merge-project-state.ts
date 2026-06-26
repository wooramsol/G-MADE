import { getTrashedEvaluationRoundIds } from "./trash";
import type { EvaluationRound, Project, ProjectFile } from "./types";

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

function sortRounds(rounds: EvaluationRound[]): EvaluationRound[] {
  return [...rounds].sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );
}

/**
 * 서버에 evaluationRounds 배열이 있으면 서버 목록만 신뢰합니다.
 * 로컬에만 있는 차수는 서버 동기화 전 신규 분석 등 로컬 전용 프로젝트에서만 유지합니다.
 */
export function mergeEvaluationRounds(
  serverRounds?: EvaluationRound[],
  localRounds?: EvaluationRound[],
  trashedRoundIds?: ReadonlySet<string>,
): EvaluationRound[] | undefined {
  const trashedIds = trashedRoundIds ?? new Set<string>();

  if (Array.isArray(serverRounds)) {
    return sortRounds(serverRounds.filter((round) => !trashedIds.has(round.id)));
  }

  const local = Array.isArray(localRounds) ? localRounds : [];
  const activeLocal = local.filter((round) => !trashedIds.has(round.id));
  if (activeLocal.length === 0) return undefined;

  return sortRounds(activeLocal);
}

function mergeTrashedEvaluationRounds(
  serverRounds?: EvaluationRound[],
  localRounds?: EvaluationRound[],
): EvaluationRound[] | undefined {
  if (Array.isArray(serverRounds)) {
    return serverRounds.length > 0 ? sortRounds(serverRounds) : [];
  }

  const local = localRounds ?? [];
  if (local.length === 0) return undefined;

  const byId = new Map<string, EvaluationRound>();
  for (const round of local) {
    byId.set(round.id, round);
  }

  return sortRounds(Array.from(byId.values()));
}

/** 서버 프로젝트와 브라우저 저장소를 병합합니다. 평가 차수는 서버 우선, 삭제 후 로컬 복원 금지. */
export function mergeProjectWithLocal(serverProject: Project, localProject?: Project): Project {
  if (!localProject) return serverProject;

  const savedEvaluationItems =
    serverProject.savedEvaluationItems?.length
      ? serverProject.savedEvaluationItems
      : localProject.savedEvaluationItems;

  const trashedEvaluationRounds = mergeTrashedEvaluationRounds(
    serverProject.trashedEvaluationRounds,
    localProject.trashedEvaluationRounds,
  );
  const trashedRoundIds = getTrashedEvaluationRoundIds(
    { trashedEvaluationRounds: serverProject.trashedEvaluationRounds },
    { trashedEvaluationRounds: localProject.trashedEvaluationRounds },
    { trashedEvaluationRounds },
  );

  const evaluationRounds = mergeEvaluationRounds(
    serverProject.evaluationRounds,
    localProject.evaluationRounds,
    trashedRoundIds,
  );

  return {
    ...localProject,
    ...serverProject,
    locationPoint: serverProject.locationPoint ?? localProject.locationPoint,
    deletedAt: serverProject.deletedAt ?? localProject.deletedAt,
    files: mergeProjectFiles(serverProject.files, localProject.files),
    savedEvaluationItems,
    uploadAnalyses: Array.isArray(serverProject.uploadAnalyses)
      ? serverProject.uploadAnalyses
      : localProject.uploadAnalyses,
    humanEvaluationSessions: Array.isArray(serverProject.humanEvaluationSessions)
      ? serverProject.humanEvaluationSessions
      : localProject.humanEvaluationSessions,
    evaluationRounds: evaluationRounds ?? [],
    trashedEvaluationRounds: trashedEvaluationRounds ?? [],
  };
}
