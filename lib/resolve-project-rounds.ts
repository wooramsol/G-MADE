import { getProjectEvaluationRounds } from "./evaluation-rounds";
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

/**
 * 서버 evaluationRounds를 기준으로 표시 목록을 만듭니다.
 * 분석 직후처럼 아직 서버에 반영되지 않은 currentRounds만 임시로 합칩니다.
 */
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

  if (Array.isArray(serverProject.evaluationRounds)) {
    const serverActive = withoutExcluded(serverProject.evaluationRounds, excludedRoundIds).filter(
      (round) => !trashedRoundIds.has(round.id),
    );
    const serverIds = new Set(serverActive.map((round) => round.id));
    const pendingCurrent = withoutExcluded(currentRounds ?? [], excludedRoundIds).filter(
      (round) => !trashedRoundIds.has(round.id) && !serverIds.has(round.id),
    );

    return unionRounds(pendingCurrent, serverActive);
  }

  const localActive = withoutExcluded(
    localProject ? getProjectEvaluationRounds(localProject) : [],
    excludedRoundIds,
  ).filter((round) => !trashedRoundIds.has(round.id));
  const localIds = new Set(localActive.map((round) => round.id));
  const pendingCurrent = withoutExcluded(currentRounds ?? [], excludedRoundIds).filter(
    (round) => !trashedRoundIds.has(round.id) && !localIds.has(round.id),
  );

  return unionRounds(pendingCurrent, localActive);
}
