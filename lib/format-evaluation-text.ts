/** 평가 근거·의견 표시용 줄바꿈 정리 (①②③, 1. 2. 등) */
export function formatEvaluationText(text: string): string {
  let formatted = text.trim();
  if (!formatted) return "";

  formatted = formatted.replace(/\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, "\n$1");
  formatted = formatted.replace(/(?<=\S)\s+(\d{1,2}\.)\s+(?=[「가-힣A-Za-z])/g, "\n$1 ");
  formatted = formatted.replace(/(?<=\S)\s+([가나다]\.)\s+/g, "\n$1 ");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  return formatted.trim();
}

/** rationale과 recommendation이 겹치지 않을 때만 합쳐 AI 블록 하나로 표시합니다. */
export function combineAiEvaluationText(rationale: string, recommendation: string): string {
  const reason = rationale.trim();
  const opinion = recommendation.trim();

  if (!reason && !opinion) return "";
  if (!opinion || reason === opinion) return reason;
  if (reason.includes(opinion)) return reason;
  if (opinion.includes(reason)) return opinion;

  return `${reason}\n\n${opinion}`;
}
