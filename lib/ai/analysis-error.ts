export class AiAnalysisError extends Error {
  constructor(message: string, _provider: "claude" = "claude") {
    super(message);
    this.name = "AiAnalysisError";
  }
}

export function isAiAnalysisError(error: unknown): error is AiAnalysisError {
  return error instanceof AiAnalysisError;
}
