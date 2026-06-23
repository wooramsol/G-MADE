import type { EvaluationRound } from "./types";

export function collectUniqueRoundFiles(round: EvaluationRound) {
  const byId = new Map<string, EvaluationRound["aiFiles"][number]>();

  for (const file of [...round.aiFiles, ...round.expertFiles]) {
    byId.set(file.id, file);
  }

  return Array.from(byId.values());
}
