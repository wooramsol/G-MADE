import type { EvaluationRound, Project } from "./types";

export function isProjectTrashed(project: Pick<Project, "deletedAt">): boolean {
  return Boolean(project.deletedAt);
}

export function filterActiveProjects(projects: Project[]): Project[] {
  return projects.filter((project) => !isProjectTrashed(project));
}

export function filterTrashedProjects(projects: Project[]): Project[] {
  return projects.filter((project) => isProjectTrashed(project));
}

export function getTrashedEvaluationRounds(project: Project): EvaluationRound[] {
  return project.trashedEvaluationRounds ?? [];
}

function sortRoundsByEvaluatedAt(rounds: EvaluationRound[]): EvaluationRound[] {
  return [...rounds].sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );
}

export function trashEvaluationRound(
  activeRounds: EvaluationRound[],
  trashedRounds: EvaluationRound[],
  roundId: string,
): { activeRounds: EvaluationRound[]; trashedRounds: EvaluationRound[] } | null {
  const round = activeRounds.find((item) => item.id === roundId);
  if (!round) return null;

  const deletedAt = new Date().toISOString();

  return {
    activeRounds: activeRounds.filter((item) => item.id !== roundId),
    trashedRounds: sortRoundsByEvaluatedAt([
      { ...round, deletedAt },
      ...trashedRounds.filter((item) => item.id !== roundId),
    ]),
  };
}

export function restoreEvaluationRound(
  activeRounds: EvaluationRound[],
  trashedRounds: EvaluationRound[],
  roundId: string,
): { activeRounds: EvaluationRound[]; trashedRounds: EvaluationRound[] } | null {
  const round = trashedRounds.find((item) => item.id === roundId);
  if (!round) return null;

  const { deletedAt: _deletedAt, ...restored } = round;

  return {
    activeRounds: sortRoundsByEvaluatedAt([...activeRounds.filter((item) => item.id !== roundId), restored]),
    trashedRounds: trashedRounds.filter((item) => item.id !== roundId),
  };
}

export function purgeEvaluationRound(
  trashedRounds: EvaluationRound[],
  roundId: string,
): EvaluationRound[] | null {
  if (!trashedRounds.some((item) => item.id === roundId)) {
    return null;
  }

  return trashedRounds.filter((item) => item.id !== roundId);
}
