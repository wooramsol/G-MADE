import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluationItems } from "../lib/demo-data";
import type { UploadedFileSummary } from "../lib/ai/analysis-types";
import {
  alignDocumentSectionsToEvaluationItems,
  resolveDocumentSectionsForDisplay,
} from "../lib/ai/document-section-summary";
import type { EvaluationRound } from "../lib/types";

function makeStoredFiles(): UploadedFileSummary[] {
  const corpus = [
    "--- 「심의도서.pdf」 p.2 ---",
    "목차",
    "1. 사업개요",
    "2. 배치도",
    "",
    "--- 「심의도서.pdf」 p.12 ---",
    "배치도",
    "주차장 배치 및 보행 동선",
    "조감도",
    "스카이라인",
  ].join("\n");

  return [
    {
      id: "file-1",
      originalName: "심의도서.pdf",
      fileType: "application/pdf",
      sizeBytes: corpus.length,
      storagePath: "",
      extractedTextPreview: corpus,
      totalPages: 20,
    },
  ];
}

const evaluationContext = {
  spatial: null,
  referenceLaws: [],
  referenceGuidelines: [],
  guidelines: [],
  lawSource: "demo-fallback" as const,
  guidelineSource: "demo-fallback" as const,
  fetchedAt: "2026-07-06T00:00:00.000Z",
  warnings: [],
};

test("alignDocumentSectionsToEvaluationItems maps legacy drawing labels to evaluation items", () => {
  const legacySections = [
    { label: "건축개요", confidence: 90, summary: "1. 「심의도서.pdf」 p.2 사업개요 — 사업명 확인" },
    { label: "배치도", confidence: 88, summary: "1. 「심의도서.pdf」 p.12 배치도 — 보행 동선 확인" },
    { label: "조감도", confidence: 84, summary: "1. 「심의도서.pdf」 p.12 조감도 — 스카이라인 확인" },
    { label: "입면도", confidence: 82, summary: "1. 「심의도서.pdf」 p.14 입면도 — 마감재 확인" },
  ];

  const aligned = alignDocumentSectionsToEvaluationItems(
    evaluationItems,
    legacySections,
    makeStoredFiles(),
    evaluationContext,
  );

  assert.equal(aligned.length, evaluationItems.length);
  assert.equal(aligned[0]!.label, "건축물 스케일 적정성");
  assert.equal(aligned[0]!.itemId, "item-urban-scale");
  assert.match(aligned[0]!.summary, /스카이라인|조감도/);
});

test("alignDocumentSectionsToEvaluationItems fills missing items with fallbacks", () => {
  const aligned = alignDocumentSectionsToEvaluationItems(
    evaluationItems.slice(0, 2),
    [],
    makeStoredFiles(),
    evaluationContext,
  );

  assert.equal(aligned.length, 2);
  assert.equal(aligned[0]!.label, evaluationItems[0]!.detailItem);
  assert.equal(aligned[1]!.label, evaluationItems[1]!.detailItem);
  assert.match(aligned[0]!.summary, /심의도서\.pdf|제출 자료/);
});

test("resolveDocumentSectionsForDisplay aligns stored round sections to evaluation items", () => {
  const round: EvaluationRound = {
    id: "round-1",
    evaluatedAt: "2026-07-06T00:00:00.000Z",
    aiWeight: 100,
    expertWeight: 0,
    evaluationItems: evaluationItems.slice(0, 3),
    totalPoints: 30,
    aiFiles: [
      {
        id: "file-1",
        originalName: "심의도서.pdf",
        fileType: "application/pdf",
        sizeBytes: 1000,
      },
    ],
    expertFiles: [],
    aiAnalysis: {
      provider: "demo",
      mode: "demo",
      summary: "demo",
      documentSections: [
        { label: "배치도", confidence: 80, summary: "1. 「심의도서.pdf」 p.12 배치도 — 보행 동선" },
        { label: "입면도", confidence: 78, summary: "1. 「심의도서.pdf」 p.14 입면도 — 마감재" },
      ],
      evaluationPreview: [],
      warnings: [],
    },
    expertItemScores: [],
  };

  const display = resolveDocumentSectionsForDisplay(round);

  assert.equal(display.length, 3);
  assert.deepEqual(
    display.map((section) => section.label),
    round.evaluationItems.map((item) => item.detailItem),
  );
});
