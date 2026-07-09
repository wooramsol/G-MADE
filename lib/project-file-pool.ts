import { formatEvaluationRoundLabel } from "./format-datetime";
import {
  projectFileToStoredRef,
  sessionFileToStoredRef,
  type StoredFileRef,
} from "./stored-file-ref";
import type { Project } from "./types";

/** 프로젝트·이전 검토 기록에서 재사용 가능한 Blob 자료를 모읍니다. */
export function collectProjectStoredFiles(project: Project): StoredFileRef[] {
  const byId = new Map<string, StoredFileRef>();

  for (const file of project.files) {
    const ref = projectFileToStoredRef(file);
    if (ref) byId.set(ref.id, ref);
  }

  const reviews = [...(project.checklistReviews ?? [])].sort(
    (left, right) => new Date(right.reviewedAt).getTime() - new Date(left.reviewedAt).getTime(),
  );

  for (const review of reviews) {
    const reviewLabel = formatEvaluationRoundLabel(review.reviewedAt);

    for (const file of review.files) {
      const ref = sessionFileToStoredRef(file);
      if (!ref) continue;

      const existing = byId.get(ref.id);
      byId.set(ref.id, {
        ...ref,
        lastUsedRoundLabel: reviewLabel,
        uploadedAt: existing?.uploadedAt ?? review.reviewedAt,
      });
    }
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
    const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function findStoredFileInProject(project: Project, fileId: string): StoredFileRef | null {
  return collectProjectStoredFiles(project).find((file) => file.id === fileId) ?? null;
}
