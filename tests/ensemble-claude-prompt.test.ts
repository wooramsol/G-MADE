import assert from "node:assert/strict";
import test from "node:test";
import { buildEnsembleClaudeInitialPrompt } from "../lib/ai/ensemble-claude-prompt";

test("buildEnsembleClaudeInitialPrompt stays compact and includes items", () => {
  const prompt = buildEnsembleClaudeInitialPrompt(
    [
      {
        id: "f1",
        originalName: "test.pdf",
        fileType: "PDF",
        sizeBytes: 100,
        storagePath: "x",
        extractedTextPreview: "page text",
      },
    ],
    {
      project: {
        id: "p1",
        name: "테스트",
        location: "서울",
        client: "",
        designer: "",
        projectType: "",
        scale: "",
        reviewType: "",
        receivedAt: "",
        status: "접수",
        files: [],
      },
      referenceLaws: [],
      referenceGuidelines: [],
      guidelines: [],
      spatial: null,
      lawSource: "demo-fallback",
      guidelineSource: "demo-fallback",
      fetchedAt: "2026-01-01",
      warnings: [],
    },
    [
      {
        id: "item-1",
        majorCategory: "A",
        middleCategory: "B",
        detailItem: "항목1",
        points: 10,
        description: "",
        criteria: "기준",
        lawIds: [],
        guidelineIds: [],
      },
    ],
  );

  assert.match(prompt, /항목1/);
  assert.match(prompt, /evaluationPreview/);
  assert.ok(prompt.length < 20_000);
});
