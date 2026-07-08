import { groupChecklistRowsByChapter, summarizeChecklistRows } from "./derive-checklist-status";
import type {
  ChecklistReviewRow,
  DesignIssue,
  LawReviewEntry,
  PreReviewResults,
  RequiredDocumentStatus,
} from "./types";

export type ChapterSummary = {
  chapter: string;
  total: number;
  reflected: number;
  notReflected: number;
  reviewNeeded: number;
  notApplicable: number;
  reflectionRate: number;
};

export type PreReviewSummaryReport = {
  projectName: string;
  evaluatedAt: string;
  reviewType?: string;
  location?: string;
  completionStatus: "완료" | "보완필요" | "점검중";
  checklist: ReturnType<typeof summarizeChecklistRows>;
  documents: {
    confirmed: number;
    mentioned: number;
    missing: number;
    total: number;
    missingItems: RequiredDocumentStatus[];
    mentionedItems: RequiredDocumentStatus[];
  };
  chapters: ChapterSummary[];
  notReflectedItems: ChecklistReviewRow[];
  reviewNeededItems: ChecklistReviewRow[];
  highPriorityIssues: DesignIssue[];
  lawReviewNeeded: LawReviewEntry[];
  actionItemCount: number;
};

function buildChapterSummaries(rows: ChecklistReviewRow[]): ChapterSummary[] {
  return groupChecklistRowsByChapter(rows).map(({ chapter, rows: chapterRows }) => {
    const reflected = chapterRows.filter((row) => row.displayStatus === "반영").length;
    const notReflected = chapterRows.filter((row) => row.displayStatus === "미반영").length;
    const reviewNeeded = chapterRows.filter((row) => row.displayStatus === "검토필요").length;
    const notApplicable = chapterRows.filter((row) => row.displayStatus === "해당없음").length;
    const total = chapterRows.length;
    const denominator = total - notApplicable;

    return {
      chapter,
      total,
      reflected,
      notReflected,
      reviewNeeded,
      notApplicable,
      reflectionRate: denominator > 0 ? Math.round((reflected / denominator) * 100) : 0,
    };
  });
}

function resolveCompletionStatus(input: {
  notReflected: number;
  reviewNeeded: number;
  missingDocuments: number;
  highPriorityIssues: number;
}): PreReviewSummaryReport["completionStatus"] {
  if (input.notReflected > 0 || input.missingDocuments > 0 || input.highPriorityIssues > 0) {
    return "보완필요";
  }
  if (input.reviewNeeded > 0) {
    return "점검중";
  }
  return "완료";
}

export function buildPreReviewSummaryReport(input: {
  results: PreReviewResults;
  projectName: string;
  evaluatedAt: string;
  reviewType?: string;
  location?: string;
}): PreReviewSummaryReport {
  const checklist = summarizeChecklistRows(input.results.checklistRows);
  const missingItems = input.results.missingDocuments.filter((doc) => doc.matchLevel === "missing");
  const mentionedItems = input.results.missingDocuments.filter((doc) => doc.matchLevel === "mentioned");
  const confirmedDocs = input.results.missingDocuments.filter((doc) => doc.matchLevel === "confirmed").length;
  const notReflectedItems = input.results.checklistRows.filter((row) => row.displayStatus === "미반영");
  const reviewNeededItems = input.results.checklistRows.filter((row) => row.displayStatus === "검토필요");
  const highPriorityIssues = input.results.designIssues.filter((issue) => issue.severity === "높음");
  const lawReviewNeeded = input.results.lawReviewEntries.filter((entry) => entry.status === "검토필요");

  const actionItemCount =
    notReflectedItems.length +
    missingItems.length +
    highPriorityIssues.length +
    lawReviewNeeded.length;

  return {
    projectName: input.projectName,
    evaluatedAt: input.evaluatedAt,
    reviewType: input.reviewType,
    location: input.location,
    completionStatus: resolveCompletionStatus({
      notReflected: checklist.notReflected,
      reviewNeeded: checklist.reviewNeeded,
      missingDocuments: missingItems.length,
      highPriorityIssues: highPriorityIssues.length,
    }),
    checklist,
    documents: {
      confirmed: confirmedDocs,
      mentioned: mentionedItems.length,
      missing: missingItems.length,
      total: input.results.missingDocuments.length,
      missingItems,
      mentionedItems,
    },
    chapters: buildChapterSummaries(input.results.checklistRows),
    notReflectedItems,
    reviewNeededItems,
    highPriorityIssues,
    lawReviewNeeded,
    actionItemCount,
  };
}
