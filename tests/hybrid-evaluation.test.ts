import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateHybridResults,
  calculateHybridScore,
  calculateProjectScore,
  clampScore,
  gradeScore,
  scaleScoreToPoints,
  toAchievementPercent,
} from "../lib/hybrid-evaluation";
import type { AiEvaluation, EvaluationItem, HumanEvaluation } from "../lib/types";

test("gradeScore maps achievement percent to grades", () => {
  assert.equal(gradeScore(95), "매우우수");
  assert.equal(gradeScore(90), "매우우수");
  assert.equal(gradeScore(85), "우수");
  assert.equal(gradeScore(75), "보통");
  assert.equal(gradeScore(65), "미흡");
  assert.equal(gradeScore(59), "매우미흡");
  assert.equal(gradeScore(0), "매우미흡");
});

test("clampScore keeps scores within 0-100", () => {
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(150), 100);
  assert.equal(clampScore(42), 42);
});

test("scaleScoreToPoints converts raw score to item points", () => {
  assert.equal(scaleScoreToPoints(80, 10), 8);
  assert.equal(scaleScoreToPoints(100, 10), 10);
  assert.equal(scaleScoreToPoints(0, 10), 0);
  assert.equal(scaleScoreToPoints(75, 20), 15);
  assert.equal(scaleScoreToPoints(50, 0), 0);
  // 100 초과 원점수는 clamp 후 환산
  assert.equal(scaleScoreToPoints(120, 10), 10);
});

test("toAchievementPercent computes percent from earned points", () => {
  assert.equal(toAchievementPercent(8, 10), 80);
  assert.equal(toAchievementPercent(0, 10), 0);
  assert.equal(toAchievementPercent(5, 0), 0);
});

test("calculateHybridScore weights ai and human scores", () => {
  const score = calculateHybridScore({
    aiScore: 80,
    humanScore: 60,
    settings: { aiWeight: 30, humanWeight: 70 },
    maxPoints: 10,
  });
  // ai 8점, 전문가 6점 → 0.3*8 + 0.7*6 = 6.6
  assert.equal(score, 6.6);
});

test("calculateHybridScore throws when both weights are zero", () => {
  assert.throws(() =>
    calculateHybridScore({
      aiScore: 80,
      humanScore: 60,
      settings: { aiWeight: 0, humanWeight: 0 },
      maxPoints: 10,
    }),
  );
});

function buildItem(id: string, points: number): EvaluationItem {
  return {
    id,
    majorCategory: "도시맥락",
    middleCategory: "주변환경",
    detailItem: `항목 ${id}`,
    points,
    description: "",
    criteria: "기준",
    lawIds: [],
    guidelineIds: [],
  };
}

function buildAiEvaluation(itemId: string, score: number): AiEvaluation {
  return {
    itemId,
    score,
    grade: gradeScore(score),
    rationale: "근거",
    recommendation: "권고",
    scoreTrace: [{ factor: "테스트", weight: 1, evidence: "증거." }],
    lawRefs: [],
    guidelineRefs: [],
    caseRefs: [],
    modelName: "test",
  };
}

function buildHumanEvaluation(itemId: string, score: number): HumanEvaluation {
  return {
    itemId,
    reviewerName: "테스트 위원",
    score,
    comment: "의견",
  };
}

test("calculateHybridResults produces one result per item with scaled scores", () => {
  const items = [buildItem("item-1", 10), buildItem("item-2", 20)];
  const results = calculateHybridResults({
    items,
    aiEvaluations: [buildAiEvaluation("item-1", 80), buildAiEvaluation("item-2", 90)],
    humanEvaluations: [buildHumanEvaluation("item-1", 70), buildHumanEvaluation("item-2", 60)],
    settings: { aiWeight: 50, humanWeight: 50 },
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].aiEvaluation.score, 8);
  assert.equal(results[0].humanEvaluation.score, 7);
  assert.equal(results[0].finalScore, 7.5);
  assert.equal(results[1].finalScore, 15);
});

test("calculateHybridResults throws on missing evaluation", () => {
  const items = [buildItem("item-1", 10)];
  assert.throws(() =>
    calculateHybridResults({
      items,
      aiEvaluations: [],
      humanEvaluations: [buildHumanEvaluation("item-1", 70)],
      settings: { aiWeight: 50, humanWeight: 50 },
    }),
  );
});

test("calculateProjectScore sums final scores capped at total points", () => {
  const items = [buildItem("item-1", 10), buildItem("item-2", 20)];
  const results = calculateHybridResults({
    items,
    aiEvaluations: [buildAiEvaluation("item-1", 100), buildAiEvaluation("item-2", 100)],
    humanEvaluations: [buildHumanEvaluation("item-1", 100), buildHumanEvaluation("item-2", 100)],
    settings: { aiWeight: 30, humanWeight: 70 },
  });

  assert.equal(calculateProjectScore(results), 30);
  assert.equal(calculateProjectScore([]), 0);
});
