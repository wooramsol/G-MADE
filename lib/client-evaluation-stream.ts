import type { EvaluationRound, Project } from "@/lib/types";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";
import type { EvaluationAnalysisProgressEvent, EvaluationAnalysisStreamEvent } from "@/lib/evaluation-analysis-progress";

export type EvaluationRoundStreamResult = {
  round: EvaluationRound;
  project?: Project;
  analysisMode?: "live" | "demo";
  warnings?: string[];
};

export async function submitEvaluationRoundStream(
  formData: FormData,
  onProgress: (event: EvaluationAnalysisProgressEvent) => void,
): Promise<EvaluationRoundStreamResult> {
  formData.set("stream", "1");

  const response = await clientFetchWithTimeout("/api/evaluation-rounds", {
    method: "POST",
    body: formData,
    headers: {
      Accept: "application/x-ndjson",
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "하이브리드 평가 분석에 실패했습니다.");
  }

  if (!response.body) {
    throw new Error("분석 응답을 읽을 수 없습니다.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = JSON.parse(trimmed) as EvaluationAnalysisStreamEvent;
      if (event.type === "progress") {
        onProgress(event);
        continue;
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }

      if (event.type === "complete") {
        return {
          round: event.round as EvaluationRound,
          project: event.project as Project | undefined,
          analysisMode: event.analysisMode as "live" | "demo" | undefined,
          warnings: event.warnings,
        };
      }
    }
  }

  throw new Error("분석이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
}
