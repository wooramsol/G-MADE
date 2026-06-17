/** 파일 1개당 AI 프롬프트에 넣을 최대 글자 수 */
export const PER_FILE_AI_TEXT_CHARS = 40_000;
/** 한 번의 분석 호출(AI/전문가 측)에서 모든 파일 합산 상한 */
export const TOTAL_AI_TEXT_CHARS = 80_000;

const SNIPPET_RADIUS = 1_200;
const MAX_SNIPPETS = 10;

const REVIEW_KEYWORDS = [
  "건축개요",
  "사업개요",
  "프로젝트 개요",
  "대지면적",
  "건축면적",
  "연면적",
  "용적률",
  "건폐율",
  "층수",
  "높이",
  "용도",
  "주용도",
  "배치도",
  "배치계획",
  "입면도",
  "단면도",
  "조감도",
  "투시도",
  "색채",
  "마감재",
  "야간",
  "조명",
  "경관",
  "보행",
  "동선",
  "녹지",
  "조경",
  "공개공간",
  "공공공간",
  "주변현황",
  "인접",
  "경관지구",
  "스카이라인",
] as const;

type TextBudgetResult = {
  text: string;
  truncated: boolean;
  originalLength: number;
};

type FileWithExtractedText = {
  originalName: string;
  extractedTextPreview?: string;
};

/** 긴 본문을 AI 프롬프트 예산 안으로 줄입니다. 앞부분 + 심의 핵심 키워드 주변을 우선 포함합니다. */
export function trimTextForAiAnalysis(text: string, charBudget: number): TextBudgetResult {
  const source = text.trim();
  const originalLength = source.length;

  if (!source || source.length <= charBudget) {
    return { text: source, truncated: false, originalLength };
  }

  if (charBudget < 400) {
    return {
      text: source.slice(0, charBudget),
      truncated: true,
      originalLength,
    };
  }

  const notice = `\n\n[원문 ${originalLength.toLocaleString("ko-KR")}자 중 AI 분석용 ${charBudget.toLocaleString("ko-KR")}자로 요약했습니다. 앞부분과 건축개요·배치·입면 등 키워드 주변을 우선 포함합니다.]`;
  const reserved = notice.length + 32;
  const usable = Math.max(400, charBudget - reserved);
  const headBudget = Math.min(Math.floor(usable * 0.45), 18_000);
  const snippetBudget = usable - headBudget;

  const head = source.slice(0, headBudget);
  const lowerSource = source.toLowerCase();
  const snippets: string[] = [];
  const seenRanges: Array<[number, number]> = [];
  let usedSnippetChars = 0;

  for (const keyword of REVIEW_KEYWORDS) {
    if (usedSnippetChars >= snippetBudget || snippets.length >= MAX_SNIPPETS) {
      break;
    }

    const kwLower = keyword.toLowerCase();
    const idx = lowerSource.indexOf(kwLower, headBudget > 0 ? Math.max(headBudget - 500, 0) : 0);
    if (idx === -1) {
      continue;
    }

    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(source.length, idx + keyword.length + SNIPPET_RADIUS);
    const overlaps = seenRanges.some(([rangeStart, rangeEnd]) => !(end < rangeStart || start > rangeEnd));
    if (overlaps) {
      continue;
    }

    const snippet = source.slice(start, end).trim();
    const remaining = snippetBudget - usedSnippetChars;
    if (remaining < 80) {
      break;
    }

    const clipped = snippet.slice(0, remaining);
    snippets.push(start > 0 || end < source.length ? `…${clipped}…` : clipped);
    usedSnippetChars += clipped.length + 2;
    seenRanges.push([start, end]);
  }

  const snippetBlock =
    snippets.length > 0 ? `\n\n[주요 항목 발췌]\n${snippets.join("\n\n")}` : "";
  let result = `${head}${snippetBlock}`;

  if (result.length + notice.length > charBudget) {
    result = result.slice(0, charBudget - notice.length);
  }

  return {
    text: `${result}${notice}`,
    truncated: true,
    originalLength,
  };
}

/** 여러 파일의 추출 본문을 AI 호출 1회 분량으로 맞춥니다. */
export function applyFilesTextBudget<T extends FileWithExtractedText>(
  files: T[],
): { files: T[]; warnings: string[] } {
  if (files.length === 0) {
    return { files, warnings: [] };
  }

  const perFileBudget = Math.min(
    PER_FILE_AI_TEXT_CHARS,
    Math.floor(TOTAL_AI_TEXT_CHARS / files.length),
  );
  const warnings: string[] = [];

  const prepared = files.map((file) => {
    const raw = file.extractedTextPreview ?? "";
    const { text, truncated, originalLength } = trimTextForAiAnalysis(raw, perFileBudget);

    if (truncated) {
      warnings.push(
        `"${file.originalName}" 본문이 길어 ${originalLength.toLocaleString("ko-KR")}자 중 ${perFileBudget.toLocaleString("ko-KR")}자만 AI에 전달했습니다.`,
      );
    }

    return {
      ...file,
      extractedTextPreview: text,
    };
  });

  return { files: prepared, warnings };
}
