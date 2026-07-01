const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("ko", { granularity: "grapheme" })
    : null;

/** PDF 등에서 추출한 본문을 한글 합성(NFC) 후 정리합니다. */
export function normalizeDocumentText(text: string): string {
  return text
    .replace(/\uFEFF/g, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/** 페이지 구분 줄바꿈을 유지하면서 본문을 정리합니다. */
export function normalizeDocumentTextPreserveLines(text: string): string {
  return text
    .replace(/\uFEFF/g, "")
    .normalize("NFC")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeWhitespace(text: string): string {
  return normalizeDocumentText(text);
}

function segmentGraphemes(text: string): string[] {
  const normalized = text.normalize("NFC");
  if (!graphemeSegmenter) {
    return [...normalized];
  }

  return [...graphemeSegmenter.segment(normalized)].map((part) => part.segment);
}

export function truncateGraphemes(text: string, maxGraphemes: number): string {
  const normalized = text.normalize("NFC");
  const segments = segmentGraphemes(normalized);
  if (segments.length <= maxGraphemes) {
    return normalized;
  }

  return segments.slice(0, maxGraphemes).join("");
}

export function sliceGraphemeRange(text: string, start: number, end: number): string {
  const normalized = text.normalize("NFC");
  const segments = segmentGraphemes(normalized);
  return segments.slice(start, end).join("");
}

/** 인용문 앞에 자모만 깨져 붙은 경우(예: ㅓ니도서) 정리합니다. */
export function sanitizeBrokenHangulQuotes(text: string): string {
  return text.replace(/"([^"]+)"/g, (match, inner: string) => {
    const cleaned = inner.replace(/^[ㄱ-ㅎㅏ-ㅣ]+(?=[가-힣(「])/, "");
    if (!cleaned.trim()) {
      return "";
    }
    return `"${cleaned}"`;
  });
}

export function hasBrokenHangulLead(text: string): boolean {
  const trimmed = text.trim();
  return /^[ㄱ-ㅎㅏ-ㅣ]{2,}/.test(trimmed) || /"[ㄱ-ㅎㅏ-ㅣ]{1,4}[가-힣]/.test(trimmed);
}
