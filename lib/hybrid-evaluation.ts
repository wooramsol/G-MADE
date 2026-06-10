import type {
  AiEvaluation,
  EvaluationGrade,
  EvaluationItem,
  HumanEvaluation,
  HybridResult,
  HybridSettings,
  ScoreTrace,
} from "./types";

export const EVALUATION_GRADE_SCALE: ReadonlyArray<{
  grade: EvaluationGrade;
  label: string;
}> = [
  { grade: "매우우수", label: "90% 이상" },
  { grade: "우수", label: "80~89%" },
  { grade: "보통", label: "70~79%" },
  { grade: "미흡", label: "60~69%" },
  { grade: "매우미흡", label: "60% 미만" },
];

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

export function formatScorePercent(score: number): string {
  return `${Math.round(clampScore(score) * 10) / 10}%`;
}

export function calculateHybridScore(input: {
  aiScore: number;
  humanScore: number;
  settings: HybridSettings;
}): number {
  const { aiWeight, humanWeight } = input.settings;
  const totalWeight = aiWeight + humanWeight;

  if (totalWeight <= 0) {
    throw new Error("AI weight and human weight cannot both be zero.");
  }

  const weightedScore =
    (clampScore(input.aiScore) * aiWeight + clampScore(input.humanScore) * humanWeight) / totalWeight;

  return Math.round(clampScore(weightedScore) * 10) / 10;
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

    const aiPercent = clampScore(aiEvaluation.score);
    const humanPercent = clampScore(humanEvaluation.score);
    const finalScore = calculateHybridScore({
      aiScore: aiPercent,
      humanScore: humanPercent,
      settings: input.settings,
    });

    return {
      item,
      aiEvaluation: {
        ...aiEvaluation,
        score: aiPercent,
        grade: gradeScore(aiPercent),
      },
      humanEvaluation: {
        ...humanEvaluation,
        score: humanPercent,
      },
      finalScore,
      finalGrade: gradeScore(finalScore),
      finalComment: buildFinalComment(aiEvaluation.scoreTrace, humanEvaluation.comment),
    };
  });
}

/** 배점 가중 평균으로 종합 달성률(%)을 계산합니다. */
export function calculateProjectScore(results: HybridResult[]): number {
  const totalPoints = results.reduce((sum, result) => sum + result.item.points, 0);

  if (totalPoints <= 0) return 0;

  const weighted = results.reduce(
    (sum, result) => sum + result.finalScore * result.item.points,
    0,
  );

  return Math.round((weighted / totalPoints) * 10) / 10;
}

export function buildFinalComment(trace: ScoreTrace[], reviewerComment: string): string {
  const primaryEvidence = [...trace].sort((a, b) => b.weight - a.weight)[0]?.evidence;
  return `${primaryEvidence} 심사위원 의견은 "${reviewerComment}"로 기록되었으며 최종 판단은 인간 심사위원 검토를 우선한다.`;
}
