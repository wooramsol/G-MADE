import { formatEvaluationRoundLabel } from "./format-datetime";
import {
  projectFileToStoredRef,
  sessionFileToStoredRef,
  type StoredFileRef,
} from "./stored-file-ref";
import type { Project } from "./types";

/** 프로젝트·이전 평가 기록에서 재사용 가능한 Blob 자료를 모읍니다. */
export function collectProjectStoredFiles(project: Project): StoredFileRef[] {
  const byId = new Map<string, StoredFileRef>();

  for (const file of project.files) {
    const ref = projectFileToStoredRef(file);
    if (ref) byId.set(ref.id, ref);
  }

  const rounds = [
    ...(project.evaluationRounds ?? []),
    ...(project.trashedEvaluationRounds ?? []),
  ];
  const sortedRounds = [...rounds].sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );

  sortedRounds.forEach((round) => {
    const roundLabel = formatEvaluationRoundLabel(round.evaluatedAt);

    for (const file of [...round.aiFiles, ...round.expertFiles]) {
      const ref = sessionFileToStoredRef(file);
      if (!ref) continue;

      const existing = byId.get(ref.id);
      byId.set(ref.id, {
        ...ref,
        lastUsedRoundLabel: roundLabel,
        uploadedAt: existing?.uploadedAt ?? round.evaluatedAt,
      });
    }
  });

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
    const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function findStoredFileInProject(project: Project, fileId: string): StoredFileRef | null {
  return collectProjectStoredFiles(project).find((file) => file.id === fileId) ?? null;
}
