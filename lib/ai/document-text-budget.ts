import type { FileWithExtractedText } from "./document-text-budget-types";

/** 글자 수 제한 없이 추출된 전체 본문을 AI에 전달합니다. */
export function applyFilesTextBudget<T extends FileWithExtractedText>(
  files: T[],
): { files: T[]; warnings: string[] } {
  return { files, warnings: [] };
}

export function trimTextForAiAnalysis(text: string): { text: string; truncated: boolean; originalLength: number } {
  const source = text.trim();
  return { text: source, truncated: false, originalLength: source.length };
}
