import type { Project } from "./types";

/** 클라이언트 스냅샷으로 서버에 없는 프로젝트를 복구할 때 신뢰할 수 있는 필드만 사용합니다. */
export function projectFromClientSnapshot(snapshot: Project): Project {
  return {
    ...snapshot,
    files: [],
    uploadAnalyses: [],
    humanEvaluationSessions: [],
    evaluationRounds: [],
    savedEvaluationItems: snapshot.savedEvaluationItems ?? [],
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
  };
}
