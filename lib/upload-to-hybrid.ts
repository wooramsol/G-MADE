import { evaluationItems } from "./demo-data";
import { gradeScore, calculateHybridResults, calculateProjectScore } from "./hybrid-evaluation";
import type {
  AiEvaluation,
  EvaluationGrade,
  HumanEvaluation,
  HybridResult,
  HybridSettings,
  UploadAnalysisSession,
} from "./types";

export type SessionHybridView = {
  session: UploadAnalysisSession;
  settings: HybridSettings;
  results: HybridResult[];
  projectScore: number;
  round: number;
};

export function buildHybridViewFromSession(
  session: UploadAnalysisSession,
  round: number,
  humanScores?: Record<string, number>,
): SessionHybridView {
  const settings: HybridSettings = {
    aiWeight: session.aiWeight,
    humanWeight: session.expertWeight,
  };

  const previewByItemId = new Map(
    session.analysis.evaluationPreview.map((row) => [row.itemId ?? row.itemName, row]),
  );

  const items = evaluationItems.filter((item) => {
    if (previewByItemId.has(item.id)) return true;
    return session.analysis.evaluationPreview.some((row) => row.itemName === item.detailItem);
  });

  const targetItems = items.length > 0 ? items : evaluationItems.slice(0, session.analysis.evaluationPreview.length);

  const aiEvaluations: AiEvaluation[] = targetItems.map((item, index) => {
    const preview =
      previewByItemId.get(item.id) ??
      session.analysis.evaluationPreview.find((row) => row.itemName === item.detailItem) ??
      session.analysis.evaluationPreview[index];

    const score = preview?.score ?? 75;
    const laws = preview?.laws ?? [];
    const lawEvidence =
      laws.length > 0 ? `적용 법령: ${laws.join(", ")}` : "업로드 자료 및 실시간 법령·공간정보 기반 분석";

    return {
      itemId: item.id,
      score,
      grade: (preview?.grade as EvaluationGrade) ?? gradeScore(score),
      rationale: preview?.rationale ?? item.criteria,
      recommendation: preview?.recommendation ?? "심사위원 검토가 필요합니다.",
      scoreTrace: [
        {
          label: "문서 분석",
          weight: 40,
          score: clamp(score + 2),
          evidence: session.analysis.summary,
        },
        {
          label: "법령·공간 맥락",
          weight: 35,
          score,
          evidence: lawEvidence,
        },
        {
          label: "평가기준 정합성",
          weight: 25,
          score: clamp(score - 1),
          evidence: item.criteria,
        },
      ],
      lawIds: [],
      guidelineIds: [],
      caseStudyIds: [],
    };
  });

  const humanEvaluations: HumanEvaluation[] = targetItems.map((item) => {
    const override = humanScores?.[item.id];
    const aiScore = aiEvaluations.find((row) => row.itemId === item.id)?.score ?? 75;
    const score = override ?? aiScore;

    return {
      itemId: item.id,
      reviewerName: "심사위원",
      score,
      comment: override !== undefined ? "심사위원이 점수를 조정했습니다." : "AI 초안 점수를 임시 반영했습니다. 검토 후 수정하세요.",
    };
  });

  const results = calculateHybridResults({
    items: targetItems,
    aiEvaluations,
    humanEvaluations,
    settings,
  });

  return {
    session,
    settings,
    results,
    projectScore: calculateProjectScore(results),
    round,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
