import assert from "node:assert/strict";
import test from "node:test";
import { buildPreReviewResults } from "@/lib/pre-review/build-pre-review-results";
import { buildPreReviewSummaryReport } from "@/lib/pre-review/build-summary-report";
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
          summary: "「심의도서.pdf」 p.31 색채계획",
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

test("checkRequiredDocuments confirms drawing titles in page corpus", () => {
  const result = checkRequiredDocuments({
    fileNames: ["심의도서.pdf"],
    pageCorpus: [
      "--- 「심의도서.pdf」 p.12 ---",
      "배치도",
      "대지 배치 계획",
      "",
      "--- 「심의도서.pdf」 p.31 ---",
      "색채계획",
      "마감재 계획",
    ].join("\n"),
    documentSections: [],
  });

  assert.equal(result.find((row) => row.id === "layout")?.matchLevel, "confirmed");
  assert.equal(result.find((row) => row.id === "elevation")?.matchLevel, "missing");
});

test("checkRequiredDocuments treats body-only mentions as 언급만", () => {
  const result = checkRequiredDocuments({
    fileNames: ["심의도서.pdf"],
    pageCorpus: [
      "--- 「심의도서.pdf」 p.45 ---",
      "현황 분석",
      "주변 건물 입면 디자인과의 조화를 검토하였다.",
    ].join("\n"),
    documentSections: [],
  });

  assert.equal(result.find((row) => row.id === "elevation")?.matchLevel, "missing");
});

test("checkRequiredDocuments does not confirm from vague section labels alone", () => {
  const result = checkRequiredDocuments({
    fileNames: ["심의도서.pdf"],
    pageCorpus: "",
    documentSections: [{ label: "색채계획", summary: "관련 내용을 검토함" }],
  });

  assert.equal(result.find((row) => row.id === "color")?.matchLevel, "mentioned");
  assert.equal(result.find((row) => row.id === "color")?.found, false);
});

test("checkRequiredDocuments confirms section with page citation", () => {
  const result = checkRequiredDocuments({
    fileNames: ["심의도서.pdf"],
    pageCorpus: "",
    documentSections: [{ label: "색채", summary: "「심의도서.pdf」 p.31 색채계획" }],
  });

  assert.equal(result.find((row) => row.id === "color")?.matchLevel, "confirmed");
});

test("deriveDesignIssues extracts AI issues only; missing docs stay in document grid", () => {
  const issues = deriveDesignIssues(makeRound());
  assert.equal(issues.some((issue) => issue.source === "rule"), false);
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

test("buildPreReviewSummaryReport aggregates action items and chapter rates", () => {
  const round = makeRound();
  const results = buildPreReviewResults(round, round.aiAnalysis.referenceLaws ?? []);
  const report = buildPreReviewSummaryReport({
    results,
    projectName: "테스트 사업",
    evaluatedAt: round.evaluatedAt,
    reviewType: "경관심의",
  });

  assert.equal(report.projectName, "테스트 사업");
  assert.equal(report.completionStatus, "보완필요");
  assert.equal(report.checklist.notReflected, 1);
  assert.ok(report.chapters.length >= 1);
  assert.ok(report.actionItemCount > 0);
  assert.equal(report.notReflectedItems.length, 1);
});

test("buildPreReviewSummaryReport excludes high-priority issues already listed as 미반영", () => {
  const round = makeRound();
  const results = buildPreReviewResults(round, round.aiAnalysis.referenceLaws ?? []);
  const report = buildPreReviewSummaryReport({
    results,
    projectName: "테스트 사업",
    evaluatedAt: round.evaluatedAt,
  });

  assert.equal(report.notReflectedItems.length, 1);
  assert.equal(
    report.highPriorityIssues.some((issue) => issue.itemId === "item-color"),
    false,
  );
  assert.ok(report.actionItemCount >= report.notReflectedItems.length);
});

test("buildPreReviewResults aggregates law review entries", () => {
  const round = makeRound();
  const results = buildPreReviewResults(round, round.aiAnalysis.referenceLaws ?? []);
  assert.ok(results.lawReviewEntries.some((entry) => entry.title === "경관의 법률"));
  assert.ok(results.checklistRows.length === 1);
});
