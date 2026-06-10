import type { EvaluationRound, Project, ProjectFile } from "./types";

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

/**
 * 서버 차수를 기준으로 병합하고, 아직 서버에 반영되지 않은 로컬 차수는 유지합니다.
 * 빈 서버 배열([])이 로컬의 신규 분석 결과를 덮어쓰지 않도록 합니다.
 */
export function mergeEvaluationRounds(
  serverRounds?: EvaluationRound[],
  localRounds?: EvaluationRound[],
): EvaluationRound[] | undefined {
  const hasServer = Array.isArray(serverRounds);
  const hasLocal = Array.isArray(localRounds);
  if (!hasServer && !hasLocal) return undefined;

  const server = hasServer ? serverRounds : [];
  const local = hasLocal ? localRounds : [];
  const serverIds = new Set(server.map((round) => round.id));
  const pendingLocal = local.filter((round) => !serverIds.has(round.id));
  const merged = [...server, ...pendingLocal];

  if (merged.length === 0) {
    return hasServer ? [] : undefined;
  }

  return merged.sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );
}

/** 서버 프로젝트와 브라우저 저장소를 병합합니다. */
export function mergeProjectWithLocal(serverProject: Project, localProject?: Project): Project {
  if (!localProject) return serverProject;

  return {
    ...serverProject,
    ...localProject,
    files: mergeProjectFiles(serverProject.files, localProject.files),
    savedEvaluationItems: localProject.savedEvaluationItems ?? serverProject.savedEvaluationItems,
    evaluationRounds: mergeEvaluationRounds(serverProject.evaluationRounds, localProject.evaluationRounds),
  };
}
