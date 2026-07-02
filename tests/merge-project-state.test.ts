import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeEvaluationRounds, mergeProjectWithLocal } from "../lib/merge-project-state";
import type { EvaluationRound, Project } from "../lib/types";

function buildRound(id: string, evaluatedAt: string): EvaluationRound {
  return {
    id,
    evaluatedAt,
    aiWeight: 30,
    expertWeight: 70,
    evaluationItems: [],
    totalPoints: 0,
    reviewerName: "테스트",
    aiFiles: [],
    expertFiles: [],
    aiAnalysis: {
      provider: "demo",
      mode: "demo",
      summary: "요약",
      documentSections: [],
      evaluationPreview: [],
      warnings: [],
    },
    expertItemScores: [],
  };
}

function buildProject(overrides: Partial<Project>): Project {
  return {
    id: "project-test",
    name: "테스트",
    location: "서울",
    client: "발주",
    designer: "설계",
    projectType: "공공건축",
    scale: "1,000㎡",
    reviewType: "경관심의",
    receivedAt: "2026-01-01",
    status: "접수",
    files: [],
    ...overrides,
  };
}

test("mergeEvaluationRounds keeps local rounds missing from server", () => {
  const serverRound = buildRound("round-server", "2026-01-02T00:00:00.000Z");
  const localRound = buildRound("round-local", "2026-01-03T00:00:00.000Z");

  const merged = mergeEvaluationRounds([serverRound], [localRound]);
  assert.equal(merged?.length, 2);
  // 최신순 정렬
  assert.equal(merged?.[0].id, "round-local");
});

test("mergeEvaluationRounds does not let empty server array erase local rounds", () => {
  const localRound = buildRound("round-local", "2026-01-03T00:00:00.000Z");
  const merged = mergeEvaluationRounds([], [localRound]);
  assert.equal(merged?.length, 1);
  assert.equal(merged?.[0].id, "round-local");
});

test("mergeProjectWithLocal prefers server metadata but unions files", () => {
  const server = buildProject({
    name: "서버 이름",
    files: [{ id: "f1", fileName: "a.pdf", fileType: "PDF", analysisStatus: "완료" }],
  });
  const local = buildProject({
    name: "로컬 이름",
    files: [{ id: "f2", fileName: "b.pdf", fileType: "PDF", analysisStatus: "완료" }],
  });

  const merged = mergeProjectWithLocal(server, local);
  assert.equal(merged.name, "서버 이름");
  assert.equal(merged.files.length, 2);
});

test("mergeProjectWithLocal falls back to local saved evaluation items", () => {
  const items = [
    {
      id: "item-1",
      majorCategory: "대",
      middleCategory: "중",
      detailItem: "세부",
      points: 10,
      description: "",
      criteria: "기준",
      lawIds: [],
      guidelineIds: [],
    },
  ];
  const server = buildProject({ savedEvaluationItems: [] });
  const local = buildProject({ savedEvaluationItems: items });

  const merged = mergeProjectWithLocal(server, local);
  assert.equal(merged.savedEvaluationItems?.length, 1);
});
