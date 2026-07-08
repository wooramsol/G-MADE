import type { EvaluationRound } from "../types";
import { extractNumberedItems } from "../format-evaluation-text";
import type { ChecklistItemStatus, ChecklistReviewRow } from "./types";

const ISSUE_PATTERN =
  /누락|모순|미기재|미흡|불명확|저촉|미달|검토\s*필요|재확인|보완|부족|확인(?:되지|불가)/;

function countIssues(text: string): number {
  const combined = [text, ...extractNumberedItems(text).items].join("\n");
  const matches = combined.match(new RegExp(ISSUE_PATTERN.source, "g"));
  return matches?.length ?? 0;
}

function resolveStatus(input: {
  score: number;
  issueCount: number;
  hasDocumentSection: boolean;
  confidence: number;
}): ChecklistItemStatus {
  if (input.issueCount > 0 || input.score < 60) return "미흡";
  if (!input.hasDocumentSection || input.confidence < 50 || input.score < 75) return "확인필요";
  return "양호";
}

/** 평가항목별 체크리스트 검토 상태를 도출합니다. */
export function deriveChecklistRows(round: EvaluationRound): ChecklistReviewRow[] {
  const sectionByItemId = new Map(
    round.aiAnalysis.documentSections
      .filter((section) => section.itemId)
      .map((section) => [section.itemId!, section]),
  );

  return round.evaluationItems.map((item) => {
    const preview =
      round.aiAnalysis.evaluationPreview.find((row) => row.itemId === item.id) ??
      round.aiAnalysis.evaluationPreview.find((row) => row.itemName === item.detailItem);
    const section = sectionByItemId.get(item.id);
    const rationale = preview?.rationale ?? "";
    const recommendation = preview?.recommendation ?? "";
    const issueCount = countIssues(`${rationale}\n${recommendation}`);
    const score = preview?.score ?? 0;

    return {
      itemId: item.id,
      itemName: item.detailItem,
      majorCategory: item.majorCategory,
      middleCategory: item.middleCategory,
      points: item.points,
      status: resolveStatus({
        score,
        issueCount,
        hasDocumentSection: Boolean(section),
        confidence: section?.confidence ?? 0,
      }),
      issueCount,
    };
  });
}
