import type { Project, ProjectFile } from "./types";

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

/** 서버 프로젝트와 브라우저 저장소를 병합할 때 평가 차수는 서버 값을 우선합니다. */
export function mergeProjectWithLocal(serverProject: Project, localProject?: Project): Project {
  if (!localProject) return serverProject;

  return {
    ...serverProject,
    ...localProject,
    files: mergeProjectFiles(serverProject.files, localProject.files),
    savedEvaluationItems: localProject.savedEvaluationItems ?? serverProject.savedEvaluationItems,
    evaluationRounds: Array.isArray(serverProject.evaluationRounds)
      ? serverProject.evaluationRounds
      : localProject.evaluationRounds,
  };
}
