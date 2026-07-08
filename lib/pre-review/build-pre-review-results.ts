import type { EvaluationRound } from "../types";
import { deriveChecklistRows } from "./derive-checklist-status";
import { deriveDesignIssues } from "./derive-design-issues";
import { deriveLawReviewEntries } from "./derive-law-review";
import { checkRequiredDocuments } from "./required-documents";
import type { PreReviewResults } from "./types";

export function buildPreReviewResults(
  round: EvaluationRound,
  referenceLaws: NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>,
): PreReviewResults {
  const fileNames = [...round.aiFiles, ...round.expertFiles].map((file) => file.originalName);
  const documentSummaries = round.aiAnalysis.documentSections.map((section) => section.summary);

  return {
    missingDocuments: checkRequiredDocuments({
      fileNames,
      pageCorpus: round.aiAnalysis.pageCorpusPreview,
      documentSummaries,
    }),
    designIssues: deriveDesignIssues(round),
    checklistRows: deriveChecklistRows(round),
    lawReviewEntries: deriveLawReviewEntries(round, referenceLaws),
  };
}
