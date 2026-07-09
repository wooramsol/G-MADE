import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import { getMaxUploadFileLabel } from "@/lib/upload-limits";
import {
  clientFetchWithTimeout,
  EVALUATION_STREAM_TIMEOUT_MS,
} from "@/lib/client-fetch-with-timeout";
import type {
  ChecklistReviewProgressEvent,
  ChecklistReviewStreamEvent,
} from "@/lib/checklist-review/progress";
import type { ChecklistReview } from "@/lib/checklist-review/types";
import type { Project } from "@/lib/types";

export type ChecklistReviewStreamResult = {
  review: ChecklistReview;
  project?: Project;
  warnings?: string[];
};

function consumeStreamEvent(event: ChecklistReviewStreamEvent): ChecklistReviewStreamResult | null {
  if (event.type === "error") {
    throw new Error(
      extractApiErrorMessage({ error: event.error }, "체크리스트 검토 중 오류가 발생했습니다."),
    );
  }

  if (event.type === "complete") {
    return {
      review: event.review,
      project: event.project,
      warnings: event.warnings,
    };
  }

  return null;
}

/** 체크리스트 검토를 스트리밍으로 실행하고 진행 상황을 콜백으로 전달합니다. */
export async function submitChecklistReviewStream(
  formData: FormData,
  onProgress: (event: ChecklistReviewProgressEvent) => void,
): Promise<ChecklistReviewStreamResult> {
  formData.set("stream", "1");

  const response = await clientFetchWithTimeout(
    "/api/checklist-reviews",
    {
      method: "POST",
      body: formData,
      headers: { Accept: "application/x-ndjson" },
    },
    EVALUATION_STREAM_TIMEOUT_MS,
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const fallback =
      response.status === 413
        ? `업로드 용량이 서버 허용 한도를 초과했습니다. 파일을 ${getMaxUploadFileLabel()} 이하로 나누어 업로드해 주세요.`
        : "체크리스트 검토에 실패했습니다.";
    throw new Error(extractApiErrorMessage(payload, fallback));
  }

  if (!response.body) {
    throw new Error("검토 응답을 읽을 수 없습니다.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (line: string): ChecklistReviewStreamResult | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const event = JSON.parse(trimmed) as ChecklistReviewStreamEvent;
    if (event.type === "heartbeat") return null;
    if (event.type === "progress") {
      onProgress(event);
      return null;
    }
    return consumeStreamEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const outcome = handleLine(line);
      if (outcome) return outcome;
    }
  }

  const trailing = handleLine(buffer);
  if (trailing) return trailing;

  throw new Error("검토가 중단되었습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
}
