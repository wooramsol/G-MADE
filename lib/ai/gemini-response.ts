type GeminiGenerateContentPayload = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export function readGeminiGenerateContent(payload: unknown): {
  text?: string;
  blockReason?: string;
  finishReason?: string;
} {
  const data = payload as GeminiGenerateContentPayload;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  return {
    text: text || undefined,
    blockReason: data.promptFeedback?.blockReason,
    finishReason: candidate?.finishReason,
  };
}

export function describeGeminiResponseIssue(input: {
  blockReason?: string;
  finishReason?: string;
  hasText: boolean;
}): string | null {
  if (input.blockReason) {
    return `Gemini가 응답을 차단했습니다(${input.blockReason}). 자료 내용을 확인하거나 다른 AI 엔진을 선택해 주세요.`;
  }

  if (!input.hasText && input.finishReason === "SAFETY") {
    return "Gemini 안전 필터로 응답이 차단되었습니다. 다른 AI 엔진을 선택해 주세요.";
  }

  if (input.finishReason === "MAX_TOKENS") {
    return "Gemini 출력이 길이 제한에 걸려 JSON이 잘렸습니다. 잠시 후 다시 시도하거나 ChatGPT를 사용해 주세요.";
  }

  if (!input.hasText) {
    return "Gemini 응답 본문이 비어 있습니다. 모델·자료 크기를 확인해 주세요.";
  }

  return null;
}
