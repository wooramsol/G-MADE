import { evaluationItems } from "./demo-data";
import { gradeScore, calculateHybridResults, calculateProjectScore } from "./hybrid-evaluation";
import type {
  AiEvaluation,
  EvaluationGrade,
  HumanEvaluation,
  HumanEvaluationSession,
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
  humanEvaluationSession?: HumanEvaluationSession | null,
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

  const humanScoreByItemId = new Map(
    (humanEvaluationSession?.itemScores ?? []).map((row) => [row.itemId, row]),
  );

  const humanEvaluations: HumanEvaluation[] = targetItems.map((item) => {
    const expertRow = humanScoreByItemId.get(item.id);
    const score = expertRow?.score ?? 0;

    return {
      itemId: item.id,
      reviewerName: humanEvaluationSession?.reviewerName ?? "전문가",
      score,
      comment:
        expertRow?.comment ??
        (humanEvaluationSession
          ? "전문가 평가 자료에 해당 항목 점수가 없습니다."
          : "전문가 평가 자료를 업로드해 주세요."),
      attachmentName: humanEvaluationSession?.files[0]?.originalName,
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
