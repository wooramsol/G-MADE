import assert from "node:assert/strict";
import test from "node:test";
import { mergeConsensusAnalysis } from "../lib/ai/consensus-merge";
import type { UploadAnalysisResult } from "../lib/ai/analysis-types";

function mockAnalysis(
  provider: "gemini" | "openai" | "claude",
  scores: number[],
): UploadAnalysisResult {
  return {
    provider,
    mode: "live",
    summary: `${provider} summary`,
    documentSections: [],
    evaluationPreview: scores.map((score, index) => ({
      itemId: `item-${index + 1}`,
      itemName: `항목 ${index + 1}`,
      score,
      grade: "보통",
      rationale: `${provider} rationale ${index + 1}`,
      recommendation: `${provider} recommendation`,
      laws: [],
      guidelines: [],
    })),
    referenceLaws: [],
    referenceGuidelines: [],
    spatialContext: null,
    lawSource: "demo-fallback",
    guidelineSource: "demo-fallback",
    contextFetchedAt: "2026-01-01T00:00:00.000Z",
    warnings: [],
  };
}

test("mergeConsensusAnalysis uses median score per item", () => {
  const items = [
    {
      id: "item-1",
      majorCategory: "A",
      middleCategory: "B",
      detailItem: "항목 1",
      points: 10,
      description: "",
      criteria: "",
      lawIds: [],
      guidelineIds: [],
    },
    {
      id: "item-2",
      majorCategory: "A",
      middleCategory: "B",
      detailItem: "항목 2",
      points: 10,
      description: "",
      criteria: "",
      lawIds: [],
      guidelineIds: [],
    },
  ];

  const consensus = mergeConsensusAnalysis({
    analyses: [
      { provider: "gemini", analysis: mockAnalysis("gemini", [60, 80]) },
      { provider: "openai", analysis: mockAnalysis("openai", [70, 70]) },
      { provider: "claude", analysis: mockAnalysis("claude", [80, 60]) },
    ],
    items,
    providersUsed: ["gemini", "openai", "claude"],
  });

  assert.equal(consensus.provider, "ensemble");
  assert.equal(consensus.evaluationPreview[0]?.score, 70);
  assert.equal(consensus.evaluationPreview[1]?.score, 70);
  assert.match(consensus.summary, /상호 검토 합의/);
});
