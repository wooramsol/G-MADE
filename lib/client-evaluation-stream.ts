import type { EvaluationRound, Project } from "@/lib/types";
import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import { getMaxUploadFileLabel } from "@/lib/upload-limits";
import {
  clientFetchWithTimeout,
  EVALUATION_STREAM_TIMEOUT_MS,
} from "@/lib/client-fetch-with-timeout";
import type { EvaluationAnalysisProgressEvent, EvaluationAnalysisStreamEvent } from "@/lib/evaluation-analysis-progress";

export type EvaluationRoundStreamResult = {
  round: EvaluationRound;
  project?: Project;
  analysisMode?: "live" | "skipped" | "demo";
  warnings?: string[];
};

function consumeStreamEvent(
  event: EvaluationAnalysisStreamEvent,
): EvaluationRoundStreamResult | null {
  if (event.type === "error") {
    throw new Error(
      extractApiErrorMessage(
        { error: (event as { error?: unknown }).error },
        "하이브리드 평가 분석 중 오류가 발생했습니다.",
      ),
    );
  }

  if (event.type === "complete") {
    return {
      round: event.round as EvaluationRound,
      project: event.project as Project | undefined,
      analysisMode: event.analysisMode as "live" | "skipped" | "demo" | undefined,
      warnings: event.warnings,
    };
  }

  return null;
}

export async function submitEvaluationRoundStream(
  formData: FormData,
  onProgress: (event: EvaluationAnalysisProgressEvent) => void,
): Promise<EvaluationRoundStreamResult> {
  formData.set("stream", "1");

  const response = await clientFetchWithTimeout(
    "/api/evaluation-rounds",
    {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/x-ndjson",
      },
    },
    EVALUATION_STREAM_TIMEOUT_MS,
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const fallback =
      response.status === 413
        ? `업로드 용량이 서버 허용 한도를 초과했습니다. 파일을 ${getMaxUploadFileLabel()} 이하로 나누어 업로드해 주세요.`
        : "하이브리드 평가 분석에 실패했습니다.";
    throw new Error(extractApiErrorMessage(payload, fallback));
  }

  if (!response.body) {
    throw new Error("분석 응답을 읽을 수 없습니다.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawProgress = false;

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
        sawProgress = true;
        onProgress(event);
        continue;
      }

      const outcome = consumeStreamEvent(event);
      if (outcome) {
        return outcome;
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const event = JSON.parse(trailing) as EvaluationAnalysisStreamEvent;
    if (event.type === "progress") {
      onProgress(event);
    } else {
      const outcome = consumeStreamEvent(event);
      if (outcome) {
        return outcome;
      }
    }
  }

  throw new Error(
    sawProgress
      ? "분석이 서버에서 중단되었습니다. Claude 사용 시 PDF 용량·항목 수에 따라 최대 5분까지 걸릴 수 있습니다. 잠시 후 다시 시도하거나 Gemini를 선택해 주세요."
      : "분석이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
  );
}
