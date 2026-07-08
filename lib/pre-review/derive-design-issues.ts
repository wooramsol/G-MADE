import { extractNumberedItems } from "../format-evaluation-text";
import type { EvaluationRound } from "../types";
import type { DesignIssue, DesignIssueSeverity, DesignIssueType } from "./types";

const ISSUE_KEYWORDS: Array<{ type: DesignIssueType; pattern: RegExp; severity: DesignIssueSeverity }> = [
  { type: "누락", pattern: /누락|미기재|제시되지|표기(?:되지|없)|없음|부재|빠져/, severity: "높음" },
  { type: "모순", pattern: /모순|불일치|상충|상이|다르게/, severity: "높음" },
  { type: "수치미기재", pattern: /수치|치수|높이|층수|면적|휘도|조도|반사율|규격.*(?:미기재|없)/, severity: "중간" },
  { type: "도면간불일치", pattern: /배치도.*입면|입면.*배치|조감.*(?:배치|입면)|도면.*(?:간|과).*(?:불일치|상이)/, severity: "높음" },
  { type: "체크리스트불일치", pattern: /체크리스트|자체점검|별지/, severity: "중간" },
  { type: "법령저촉", pattern: /법(?:률|령)|조례|지침|제\s*\d+\s*조|저촉|미달/, severity: "중간" },
];

const FILE_PAGE_PATTERN = /「([^」]+)」(?:\s*(p\.\d+(?:\s*[·,]\s*p\.\d+)*))?/i;

function classifyIssue(text: string): { type: DesignIssueType; severity: DesignIssueSeverity } {
  for (const rule of ISSUE_KEYWORDS) {
    if (rule.pattern.test(text)) {
      return { type: rule.type, severity: rule.severity };
    }
  }
  return { type: "기타", severity: "낮음" };
}

function extractFilePage(text: string): { file?: string; page?: string } {
  const match = text.match(FILE_PAGE_PATTERN);
  if (!match) return {};
  return {
    file: match[1],
    page: match[2]?.trim(),
  };
}

function issueId(parts: string[]): string {
  return parts.filter(Boolean).join("::");
}

/** AI rationale·recommendation에서 설계안 오류·누락 이슈를 추출합니다. (누락 도면은 ①탭 그리드에서만 표시) */
export function deriveDesignIssues(round: EvaluationRound): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const seen = new Set<string>();

  for (const preview of round.aiAnalysis.evaluationPreview) {
    const lines = [
      ...extractNumberedItems(preview.rationale ?? "").items,
      ...extractNumberedItems(preview.recommendation ?? "").items,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 12) continue;
      if (!/(누락|모순|미기재|미흡|불명확|저촉|미달|검토\s*필요|재확인|보완)/.test(trimmed)) {
        continue;
      }

      const { type, severity } = classifyIssue(trimmed);
      const { file, page } = extractFilePage(trimmed);
      const id = issueId(["ai", preview.itemId ?? preview.itemName, trimmed.slice(0, 80)]);
      if (seen.has(id)) continue;
      seen.add(id);

      issues.push({
        id,
        type,
        severity,
        description: trimmed,
        file,
        page,
        itemId: preview.itemId,
        itemName: preview.itemName,
        source: "ai",
      });
    }
  }

  const severityOrder: Record<DesignIssueSeverity, number> = { 높음: 0, 중간: 1, 낮음: 2 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
