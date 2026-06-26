export class AiAnalysisError extends Error {
  readonly provider: "openai" | "gemini" | "claude" | "auto";

  constructor(message: string, provider: AiAnalysisError["provider"] = "auto") {
    super(message);
    this.name = "AiAnalysisError";
    this.provider = provider;
  }
}

export function isAiAnalysisError(error: unknown): error is AiAnalysisError {
  return error instanceof AiAnalysisError;
}
