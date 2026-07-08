import type { EvaluationRound } from "../types";
import { extractNumberedItems } from "../format-evaluation-text";
import type {
  ChecklistDisplayStatus,
  ChecklistItemStatus,
  ChecklistReviewRow,
  ChecklistSummary,
} from "./types";

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

function resolveDisplayStatus(input: {
  status: ChecklistItemStatus;
  hasDocumentSection: boolean;
  confidence: number;
  score: number;
}): ChecklistDisplayStatus {
  if (!input.hasDocumentSection && input.confidence < 30 && input.score === 0) {
    return "해당없음";
  }
  if (input.status === "양호") return "반영";
  if (input.status === "미흡") return "미반영";
  return "검토필요";
}

function buildRationalePreview(rationale: string, recommendation: string): string | undefined {
  const combined = [rationale, recommendation].filter(Boolean).join("\n").trim();
  if (!combined) return undefined;
  const firstLine = combined.split("\n").find((line) => line.trim())?.trim() ?? combined;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

/** 체크리스트 집계 (진행률·챕터별 요약용) */
export function summarizeChecklistRows(rows: ChecklistReviewRow[]): ChecklistSummary {
  const reflected = rows.filter((row) => row.displayStatus === "반영").length;
  const notReflected = rows.filter((row) => row.displayStatus === "미반영").length;
  const reviewNeeded = rows.filter((row) => row.displayStatus === "검토필요").length;
  const notApplicable = rows.filter((row) => row.displayStatus === "해당없음").length;
  const checked = reflected + notReflected + notApplicable;
  const total = rows.length;

  return {
    total,
    reflected,
    notReflected,
    reviewNeeded,
    notApplicable,
    progressPercent: total > 0 ? Math.round((checked / total) * 100) : 0,
  };
}

/** 대분류(챕터)별로 체크리스트를 묶습니다. */
export function groupChecklistRowsByChapter(
  rows: ChecklistReviewRow[],
): Array<{ chapter: string; rows: ChecklistReviewRow[] }> {
  const groups = new Map<string, ChecklistReviewRow[]>();

  for (const row of rows) {
    const chapter = row.majorCategory.trim() || "기타";
    const bucket = groups.get(chapter) ?? [];
    bucket.push(row);
    groups.set(chapter, bucket);
  }

  return [...groups.entries()].map(([chapter, chapterRows]) => ({
    chapter,
    rows: chapterRows,
  }));
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
    const hasDocumentSection = Boolean(section);
    const confidence = section?.confidence ?? 0;
    const status = resolveStatus({
      score,
      issueCount,
      hasDocumentSection,
      confidence,
    });

    return {
      itemId: item.id,
      itemName: item.detailItem,
      majorCategory: item.majorCategory,
      middleCategory: item.middleCategory,
      points: item.points,
      status,
      displayStatus: resolveDisplayStatus({
        status,
        hasDocumentSection,
        confidence,
        score,
      }),
      issueCount,
      hasDocumentSection,
      rationalePreview: buildRationalePreview(rationale, recommendation),
    };
  });
}
