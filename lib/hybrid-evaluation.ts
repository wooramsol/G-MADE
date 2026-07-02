import type {
  AiEvaluation,
  EvaluationGrade,
  EvaluationItem,
  HumanEvaluation,
  HybridResult,
  HybridSettings,
  ScoreTrace,
} from "./types";

export function gradeScore(score: number): EvaluationGrade {
  if (score >= 90) return "매우우수";
  if (score >= 80) return "우수";
  if (score >= 70) return "보통";
  if (score >= 60) return "미흡";
  return "매우미흡";
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/** 0~100 만점 원점수를 항목 배점으로 환산합니다. */
export function scaleScoreToPoints(score: number, maxPoints: number): number {
  if (maxPoints <= 0) return 0;

  const scaled = (clampScore(score) / 100) * maxPoints;
  return Math.round(Math.min(maxPoints, scaled) * 10) / 10;
}

/** 배점 대비 달성률(%) — 등급 산정에 사용합니다. */
export function toAchievementPercent(scoreOnPoints: number, maxPoints: number): number {
  if (maxPoints <= 0) return 0;
  return clampScore((scoreOnPoints / maxPoints) * 100);
}

export function calculateHybridScore(input: {
  aiScore: number;
  humanScore: number;
  settings: HybridSettings;
  maxPoints: number;
}): number {
  const { aiWeight, humanWeight } = input.settings;
  const totalWeight = aiWeight + humanWeight;

  if (totalWeight <= 0) {
    throw new Error("AI weight and human weight cannot both be zero.");
  }

  const aiOnPoints = scaleScoreToPoints(input.aiScore, input.maxPoints);
  const humanOnPoints = scaleScoreToPoints(input.humanScore, input.maxPoints);
  const weightedScore = (aiOnPoints * aiWeight + humanOnPoints * humanWeight) / totalWeight;

  return Math.round(Math.min(input.maxPoints, weightedScore) * 10) / 10;
}

export function calculateHybridResults(input: {
  items: EvaluationItem[];
  aiEvaluations: AiEvaluation[];
  humanEvaluations: HumanEvaluation[];
  settings: HybridSettings;
}): HybridResult[] {
  return input.items.map((item) => {
    const aiEvaluation = input.aiEvaluations.find((evaluation) => evaluation.itemId === item.id);
    const humanEvaluation = input.humanEvaluations.find(
      (evaluation) => evaluation.itemId === item.id,
    );

    if (!aiEvaluation || !humanEvaluation) {
      throw new Error(`Missing evaluation data for item ${item.id}.`);
    }

    const aiScoreOnPoints = scaleScoreToPoints(aiEvaluation.score, item.points);
    const humanScoreOnPoints = scaleScoreToPoints(humanEvaluation.score, item.points);
    const finalScore = calculateHybridScore({
      aiScore: aiEvaluation.score,
      humanScore: humanEvaluation.score,
      settings: input.settings,
      maxPoints: item.points,
    });

    return {
      item,
      aiEvaluation: {
        ...aiEvaluation,
        score: aiScoreOnPoints,
        grade: gradeScore(toAchievementPercent(aiScoreOnPoints, item.points)),
      },
      humanEvaluation: {
        ...humanEvaluation,
        score: humanScoreOnPoints,
      },
      finalScore,
      finalGrade: gradeScore(toAchievementPercent(finalScore, item.points)),
      finalComment: buildFinalComment(aiEvaluation.scoreTrace, humanEvaluation.comment),
    };
  });
}

export function calculateProjectScore(results: HybridResult[]): number {
  const totalPoints = results.reduce((sum, result) => sum + result.item.points, 0);

  if (totalPoints <= 0) return 0;

  const earned = results.reduce((sum, result) => sum + result.finalScore, 0);

  return Math.round(Math.min(totalPoints, earned) * 10) / 10;
}

export function buildFinalComment(trace: ScoreTrace[], reviewerComment: string): string {
  const primaryEvidence = [...trace].sort((a, b) => b.weight - a.weight)[0]?.evidence;
  return `${primaryEvidence} 심사위원 의견은 "${reviewerComment}"로 기록되었으며 최종 판단은 인간 심사위원 검토를 우선한다.`;
}
