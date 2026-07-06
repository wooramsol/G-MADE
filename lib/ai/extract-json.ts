export function extractJsonContent(content: string | undefined): string | undefined {
  if (!content) return undefined;

  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // 모델이 JSON 앞뒤에 설명 문장을 붙이는 경우: 가장 바깥 중괄호 구간만 추출한다.
  if (!trimmed.startsWith("{")) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return trimmed.slice(start, end + 1);
    }
  }

  return trimmed;
}
