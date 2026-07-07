import { sanitizeBrokenHangulQuotes } from "./document-text-utils";
import { formatEvaluationText, renumberEvaluationText } from "./format-evaluation-text";

/** PDF OCR에서 흔한 "반 영 미" 형태(음절 사이 공백)를 합칩니다. */
export function collapseSpacedHangulSyllables(text: string): string {
  return text.replace(/(?:[가-힣](?:\s+[가-힣]){2,})/g, (match) => {
    const parts = match.split(/\s+/).filter(Boolean);
    if (parts.length >= 3 && parts.every((part) => part.length === 1)) {
      return parts.join("");
    }
    return match;
  });
}

/** ●·• 등 불릿을 줄바꿈·번호 목록으로 정리합니다. */
export function normalizeDocumentSectionBullets(text: string): string {
  return text
    .replace(/[●•◦▪]\s*/g, "\n")
    .replace(/^\s*[-—]{2,}\s*/gm, "")
    .replace(/\s*[-—]{3,}\s*/g, " — ");
}

/** 페이지 마커(--- 「파일」 p.N ---)를 읽기 쉬운 형태로 바꿉니다. */
export function normalizeDocumentSectionPageMarkers(text: string): string {
  return text
    .replace(/---\s*「([^」]+)」\s*p\.(\d+)\s*---/gi, "「$1」 p.$2")
    .replace(/---+/g, " — ");
}

function isFragmentLine(line: string): boolean {
  const stripped = line
    .replace(/^\d{1,2}\.\s*/, "")
    .replace(/^[●•◦▪]\s*/, "")
    .trim();

  if (!stripped) return true;
  if (stripped.length <= 3) return true;
  if (/^[가-힣]{1,2}$/.test(stripped)) return true;
  if (/^[●•◦▪고주변배치입면]$/.test(stripped)) return true;
  if (/^[-—….\s]+$/.test(stripped)) return true;
  if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(stripped)) return true;

  return false;
}

/** 끊긴 조각·빈 줄·의미 없는 기호만 있는 줄을 제거합니다. */
export function dropDocumentSectionFragmentLines(text: string): string {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isFragmentLine(line));

  return lines.join("\n");
}

export function hasDocumentSectionOcrArtifacts(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  if (/(?:[가-힣]\s){4,}[가-힣]/.test(text)) return true;
  if (/[●•◦▪]{2,}/.test(text)) return true;
  if (/---\s*「/.test(text) && !/^\d+\.\s/m.test(text)) return true;
  if (normalized.length > 0 && normalized.length < text.replace(/\s/g, "").length * 0.55) {
    return true;
  }
  return false;
}

/** 읽은 자료(documentSections) 표시용 텍스트 정리 */
export function formatDocumentSectionText(text: string): string {
  let formatted = text.trim();
  if (!formatted) return "";

  formatted = sanitizeBrokenHangulQuotes(formatted);
  formatted = normalizeDocumentSectionPageMarkers(formatted);
  formatted = normalizeDocumentSectionBullets(formatted);
  formatted = collapseSpacedHangulSyllables(formatted);
  formatted = dropDocumentSectionFragmentLines(formatted);
  formatted = formatted.replace(/\s+—\s+—\s+/g, " — ");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  formatted = formatEvaluationText(formatted);
  return renumberEvaluationText(formatted);
}
