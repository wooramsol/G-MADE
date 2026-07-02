import type { EvaluationRound, Project } from "@/lib/types";
import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import { getMaxUploadFileLabel } from "@/lib/upload-limits";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";
import type { EvaluationAnalysisProgressEvent, EvaluationAnalysisStreamEvent } from "@/lib/evaluation-analysis-progress";

export type EvaluationRoundStreamResult = {
  round: EvaluationRound;
  project?: Project;
  analysisMode?: "live" | "skipped" | "demo";
  warnings?: string[];
};

/** 서버 maxDuration(300초)보다 길게 잡아 클라이언트가 먼저 끊지 않도록 한다. */
const EVALUATION_STREAM_TIMEOUT_MS = 320_000;

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

  const handleLine = (line: string): EvaluationRoundStreamResult | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    let event: EvaluationAnalysisStreamEvent;
    try {
      event = JSON.parse(trimmed) as EvaluationAnalysisStreamEvent;
    } catch {
      // 손상된 NDJSON 한 줄이 전체 분석을 실패시키지 않도록 무시한다.
      return null;
    }

    if (event.type === "progress") {
      onProgress(event);
      return null;
    }

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
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const result = handleLine(line);
      if (result) return result;
    }
  }

  // 스트림 종료 시 개행 없이 남은 마지막 이벤트(complete 등)를 처리한다.
  buffer += decoder.decode();
  if (buffer.trim()) {
    const result = handleLine(buffer);
    if (result) return result;
  }

  throw new Error("분석이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
}
