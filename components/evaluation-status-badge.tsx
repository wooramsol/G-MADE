import { Badge } from "@/components/typography";
import {
  evaluationStatusToneClassName,
  getProjectEvaluationStatus,
} from "@/lib/project-evaluation-status";
import type { Project } from "@/lib/types";

export default function EvaluationStatusBadge({ project }: { project: Project }) {
  const status = getProjectEvaluationStatus(project);

  return (
    <Badge className={`shrink-0 ${evaluationStatusToneClassName(status.tone)}`}>{status.label}</Badge>
  );
}
