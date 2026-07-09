import { truncateGraphemes } from "../document-text-utils";
import type { UploadedFileSummary } from "./uploaded-file";

/** Claude 요청당 파일 본문 상한 (초과 시 앞부분만 사용). */
export const CLAUDE_MAX_CHARS_PER_FILE = 28_000;

export function prepareFilesForClaudeAnalysis(
  files: UploadedFileSummary[],
  maxCharsPerFile = CLAUDE_MAX_CHARS_PER_FILE,
): { files: UploadedFileSummary[]; warnings: string[] } {
  const warnings: string[] = [];

  const prepared = files.map((file) => {
    const source = (file.extractedTextPreview ?? "").trim();
    if (source.length <= maxCharsPerFile) {
      return file;
    }

    warnings.push(
      `Claude 분석: "${file.originalName}" 본문이 길어 앞 ${maxCharsPerFile.toLocaleString("ko-KR")}자만 사용합니다. 필요 시 파일을 나누어 업로드해 주세요.`,
    );

    return {
      ...file,
      extractedTextPreview: `${truncateGraphemes(source, maxCharsPerFile)}\n...[본문 일부 생략 — 전체 분석은 Gemini 권장]`,
    };
  });

  return { files: prepared, warnings };
}
