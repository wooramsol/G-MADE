import { evaluationItems as defaultEvaluationItems } from "./demo-data";
import type { EvaluationItem, EvaluationRound, Project } from "./types";

export function createDefaultEvaluationItems(): EvaluationItem[] {
  return defaultEvaluationItems.map((item) => ({ ...item }));
}

export function getProjectEvaluationRounds(project: Project): EvaluationRound[] {
  if (project.evaluationRounds && project.evaluationRounds.length > 0) {
    return project.evaluationRounds;
  }

  const aiSessions = [...(project.uploadAnalyses ?? [])].sort(
    (a, b) => new Date(a.analyzedAt).getTime() - new Date(b.analyzedAt).getTime(),
  );
  const expertSessions = [...(project.humanEvaluationSessions ?? [])].sort(
    (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
  );

  const count = Math.max(aiSessions.length, expertSessions.length);
  if (count === 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const ai = aiSessions[index];
    const expert = expertSessions[index];
    const evaluatedAt = ai?.analyzedAt ?? expert?.uploadedAt ?? new Date().toISOString();

    return {
      id: ai?.id ?? expert?.id ?? `legacy-round-${index}`,
      evaluatedAt,
      aiWeight: ai?.aiWeight ?? 30,
      expertWeight: ai?.expertWeight ?? 70,
      evaluationItems: createDefaultEvaluationItems(),
      totalPoints: ai?.totalPoints ?? createDefaultEvaluationItems().reduce((sum, item) => sum + item.points, 0),
      reviewerName: expert?.reviewerName ?? "전문가",
      expertSummary: expert?.summary,
      aiFiles: ai?.files ?? [],
      expertFiles: expert?.files ?? [],
      aiAnalysis:
        ai?.analysis ??
        ({
          provider: "demo",
          mode: "demo",
          summary: "AI 분석 결과가 없습니다.",
          documentSections: [],
          evaluationPreview: [],
          warnings: [],
        } as EvaluationRound["aiAnalysis"]),
      expertItemScores: expert?.itemScores ?? [],
    };
  });
}

export function createEmptyEvaluationItem(index: number): EvaluationItem {
  return {
    id: `item-custom-${Date.now()}-${index}`,
    majorCategory: "대분류",
    middleCategory: "중분류",
    detailItem: "세부 평가항목",
    points: 10,
    description: "",
    criteria: "평가 기준을 입력합니다.",
    lawIds: [],
    guidelineIds: [],
  };
}
