import type { EvaluationItem, EvaluationRound, Project } from "./types";
import { evaluationItems as defaultEvaluationItems } from "./demo-data";

export function createDefaultEvaluationItems(): EvaluationItem[] {
  return defaultEvaluationItems.map((item) => ({ ...item }));
}

/** 평가 차수는 evaluationRounds 배열만 사용합니다. (레거시 uploadAnalyses 복원 금지) */
export function getProjectEvaluationRounds(project: Project): EvaluationRound[] {
  return Array.isArray(project.evaluationRounds) ? project.evaluationRounds : [];
}

export function createEmptyEvaluationItem(index: number): EvaluationItem {
  return {
    id: `item-custom-${Date.now()}-${index}`,
    majorCategory: "",
    middleCategory: "",
    detailItem: "",
    points: 10,
    description: "",
    criteria: "",
    lawIds: [],
    guidelineIds: [],
  };
}

export function isCustomEvaluationItem(item: EvaluationItem): boolean {
  return item.id.startsWith("item-custom-");
}
