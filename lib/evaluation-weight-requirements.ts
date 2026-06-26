export const DEFAULT_AI_WEIGHT = 100;
export const DEFAULT_EXPERT_WEIGHT = 100 - DEFAULT_AI_WEIGHT;

export function getExpertWeight(aiWeight: number): number {
  return 100 - aiWeight;
}

export function requiresAiUploadMaterials(aiWeight: number): boolean {
  return aiWeight > 0;
}

export function requiresExpertUploadMaterials(expertWeight: number): boolean {
  return expertWeight > 0;
}

export function requiresEvaluationUploadMaterials(aiWeight: number, expertWeight: number): boolean {
  return requiresAiUploadMaterials(aiWeight) || requiresExpertUploadMaterials(expertWeight);
}

export function validateEvaluationWeights(aiWeight: number, expertWeight: number): string | null {
  if (aiWeight <= 0 && expertWeight <= 0) {
    return "AI 또는 전문가 가중치 중 하나는 0%보다 커야 합니다.";
  }
  return null;
}
