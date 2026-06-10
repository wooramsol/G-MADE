import {
  evaluationStatusToneClassName,
  getProjectEvaluationStatus,
} from "@/lib/project-evaluation-status";
import type { Project } from "@/lib/types";

export default function EvaluationStatusBadge({ project }: { project: Project }) {
  const status = getProjectEvaluationStatus(project);

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${evaluationStatusToneClassName(status.tone)}`}
    >
      {status.label}
    </span>
  );
}
