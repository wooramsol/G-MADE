import { getProjectEvaluationRounds } from "./evaluation-rounds";
import { mergeEvaluationRounds } from "./merge-project-state";
import type { EvaluationRound, Project } from "./types";

function sortRounds(rounds: EvaluationRound[]): EvaluationRound[] {
  return [...rounds].sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );
}

function unionRounds(...lists: Array<EvaluationRound[] | undefined>): EvaluationRound[] {
  const byId = new Map<string, EvaluationRound>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const round of list) {
      byId.set(round.id, round);
    }
  }

  return sortRounds(Array.from(byId.values()));
}

/** 서버·로컬·현재 React 상태의 평가 차수를 합칩니다. 신규 분석 직후 서버가 비어 있어도 차수가 줄지 않습니다. */
export function resolveProjectRounds({
  serverProject,
  localProject,
  currentRounds,
}: {
  serverProject: Project;
  localProject?: Project;
  currentRounds?: EvaluationRound[];
}): EvaluationRound[] {
  const serverRounds = getProjectEvaluationRounds(serverProject);
  const localRounds = localProject ? getProjectEvaluationRounds(localProject) : [];
  const mergedMeta = mergeEvaluationRounds(serverProject.evaluationRounds, localProject?.evaluationRounds);
  const mergedFromMeta = mergedMeta ? getProjectEvaluationRounds({ ...serverProject, evaluationRounds: mergedMeta }) : [];

  return unionRounds(currentRounds, mergedFromMeta, localRounds, serverRounds);
}
