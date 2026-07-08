import assert from "node:assert/strict";
import test from "node:test";
import { buildPreReviewResults } from "@/lib/pre-review/build-pre-review-results";
import { deriveChecklistRows, summarizeChecklistRows } from "@/lib/pre-review/derive-checklist-status";
import { deriveDesignIssues } from "@/lib/pre-review/derive-design-issues";
import { checkRequiredDocuments } from "@/lib/pre-review/required-documents";
import type { EvaluationRound } from "@/lib/types";

function makeRound(overrides: Partial<EvaluationRound> = {}): EvaluationRound {
  return {
    id: "round-1",
    evaluatedAt: "2026-07-08T00:00:00.000Z",
    aiWeight: 100,
    expertWeight: 0,
    totalPoints: 10,
    reviewerName: "테스트",
    aiFiles: [{ id: "f1", originalName: "심의도서.pdf", fileType: "pdf", sizeBytes: 1000 }],
    expertFiles: [],
    expertItemScores: [],
    evaluationItems: [
      {
        id: "item-color",
        majorCategory: "건축경관",
        middleCategory: "색채계획",
        detailItem: "주조색과 강조색의 조화",
        points: 10,
        description: "",
        criteria: "",
        lawIds: [],
        guidelineIds: [],
      },
    ],
    aiAnalysis: {
      provider: "gemini",
      mode: "live",
      summary: "요약",
      documentSections: [
        {
          itemId: "item-color",
          label: "색채계획",
          confidence: 80,
          summary: "p.31 색채계획",
        },
      ],
      evaluationPreview: [
        {
          itemId: "item-color",
          itemName: "주조색과 강조색의 조화",
          score: 55,
          grade: "미흡",
          rationale:
            "1. 「심의도서.pdf」 p.12 경관체크리스트 '고광택 재료 회피' — p.31 Steel N7 마감재와 모순 — 경관의 법률 제28조 관련 저촉 검토 필요",
          recommendation: "p.31 색채계획에 반사율 수치를 명시하시기 바랍니다.",
          laws: ["경관의 법률 제28조"],
          guidelines: [],
        },
      ],
      referenceLaws: [
        {
          title: "경관의 법률",
          article: "제28조",
          summary: "경관계획",
          sourceUrl: "https://www.law.go.kr/example",
        },
      ],
      warnings: [],
      pageCorpusPreview: "p.12 경관체크리스트\np.25 주차·보행 동선도",
    },
    ...overrides,
  };
}

test("checkRequiredDocuments detects missing elevation plan", () => {
  const result = checkRequiredDocuments({
    fileNames: ["심의도서.pdf"],
    pageCorpus: "p.12 배치도\np.31 색채계획",
    documentSummaries: [],
  });

  assert.equal(result.find((row) => row.id === "layout")?.found, true);
  assert.equal(result.find((row) => row.id === "elevation")?.found, false);
});

test("deriveDesignIssues includes rule-based and AI issues", () => {
  const issues = deriveDesignIssues(makeRound());
  assert.ok(issues.some((issue) => issue.source === "rule" && issue.type === "누락"));
  assert.ok(issues.some((issue) => issue.source === "ai" && /Steel N7/.test(issue.description)));
});

test("deriveChecklistRows marks issue-heavy item as 미반영 display", () => {
  const rows = deriveChecklistRows(makeRound());
  assert.equal(rows[0]?.status, "미흡");
  assert.equal(rows[0]?.displayStatus, "미반영");
  assert.ok((rows[0]?.issueCount ?? 0) > 0);
  assert.equal(rows[0]?.hasDocumentSection, true);
});

test("summarizeChecklistRows counts display statuses", () => {
  const rows = deriveChecklistRows(makeRound());
  const summary = summarizeChecklistRows(rows);
  assert.equal(summary.total, 1);
  assert.equal(summary.notReflected, 1);
  assert.equal(summary.reflected, 0);
});

test("buildPreReviewResults aggregates law review entries", () => {
  const round = makeRound();
  const results = buildPreReviewResults(round, round.aiAnalysis.referenceLaws ?? []);
  assert.ok(results.lawReviewEntries.some((entry) => entry.title === "경관의 법률"));
  assert.ok(results.checklistRows.length === 1);
});
