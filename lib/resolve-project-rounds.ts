import { getProjectEvaluationRounds } from "./evaluation-rounds";
import { mergeEvaluationRounds } from "./merge-project-state";
import { getTrashedEvaluationRoundIds } from "./trash";
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

function withoutExcluded(rounds: EvaluationRound[], excludedRoundIds?: ReadonlySet<string>): EvaluationRound[] {
  if (!excludedRoundIds?.size) return rounds;
  return rounds.filter((round) => !excludedRoundIds.has(round.id));
}

/** 서버·로컬·현재 React 상태의 평가 차수를 합칩니다. 신규 분석 직후 서버가 비어 있어도 차수가 줄지 않습니다. */
export function resolveProjectRounds({
  serverProject,
  localProject,
  currentRounds,
  excludedRoundIds,
}: {
  serverProject: Project;
  localProject?: Project;
  currentRounds?: EvaluationRound[];
  excludedRoundIds?: ReadonlySet<string>;
}): EvaluationRound[] {
  const trashedRoundIds = getTrashedEvaluationRoundIds(serverProject, localProject);
  const serverRounds = withoutExcluded(getProjectEvaluationRounds(serverProject), excludedRoundIds).filter(
    (round) => !trashedRoundIds.has(round.id),
  );
  const localRounds = withoutExcluded(
    localProject ? getProjectEvaluationRounds(localProject) : [],
    excludedRoundIds,
  ).filter((round) => !trashedRoundIds.has(round.id));
  const mergedMeta = mergeEvaluationRounds(
    serverProject.evaluationRounds,
    localProject?.evaluationRounds,
    trashedRoundIds,
  );
  const mergedFromMeta = withoutExcluded(
    mergedMeta ? getProjectEvaluationRounds({ ...serverProject, evaluationRounds: mergedMeta }) : [],
    excludedRoundIds,
  ).filter((round) => !trashedRoundIds.has(round.id));
  const safeCurrent = withoutExcluded(currentRounds ?? [], excludedRoundIds);

  return unionRounds(safeCurrent, mergedFromMeta, localRounds, serverRounds);
}
