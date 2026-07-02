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
  if (aiWeight < 0 || expertWeight < 0 || aiWeight > 100 || expertWeight > 100) {
    return "가중치는 0~100% 범위여야 합니다.";
  }
  if (aiWeight + expertWeight !== 100) {
    return "AI 가중치와 전문가 가중치의 합은 100%여야 합니다.";
  }
  return null;
}
