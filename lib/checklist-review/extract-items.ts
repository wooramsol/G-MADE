import { CLAUDE_FAST_MODEL } from "@/lib/ai/claude-models";
import { extractJsonContent } from "@/lib/ai/extract-json";
import type { PageSlice } from "@/lib/ai/page-citation";
import { callClaude } from "./claude-call";
import { buildChecklistPagesText } from "./find-checklist-pages";
import type { ChecklistItem } from "./types";

const EXTRACT_SYSTEM_PROMPT = `당신은 경관·공공디자인 심의 문서에서 체크리스트 항목을 추출하는 도구입니다.
입력은 PDF에서 추출한 '체크리스트' 페이지들의 텍스트입니다. 페이지 구분은 --- 「파일명」 p.N --- 형식입니다.
규칙:
- 체크리스트 표의 '항목(점검 내용)'만 추출합니다. 머리말, 열 제목(반영여부·비고 등), 페이지 번호, 범례는 제외합니다.
- 항목 원문을 최대한 그대로 보존합니다 (요약·의역 금지).
- 구분(장·부문·분야) 제목이 있으면 category에 넣습니다.
- 각 항목이 어느 페이지에 있는지 fileName과 page를 기록합니다.
- 반드시 JSON 배열만 출력합니다: [{"category": "...", "text": "...", "fileName": "...", "page": 3}, ...]`;

type RawExtractedItem = {
  category?: string;
  text?: string;
  fileName?: string;
  page?: number;
};

export function parseExtractedItems(raw: string, fallbackPage?: { fileName: string; page: number }): ChecklistItem[] {
  const json = extractJsonContent(raw);
  if (!json) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const items: ChecklistItem[] = [];
  for (const entry of parsed as RawExtractedItem[]) {
    const text = String(entry?.text ?? "").trim();
    if (!text || text.length < 4) continue;

    const category = String(entry?.category ?? "").trim() || undefined;
    const fileName = String(entry?.fileName ?? "").trim() || fallbackPage?.fileName;
    const page = Number(entry?.page) || fallbackPage?.page;

    items.push({
      id: `c${items.length + 1}`,
      category,
      text,
      source: fileName && page ? { fileName, page } : undefined,
    });
  }

  return items;
}

/** 체크리스트 페이지 텍스트에서 항목을 추출합니다 (경량 모델). */
export async function extractChecklistItems(pages: PageSlice[]): Promise<{
  items: ChecklistItem[];
  model: string;
}> {
  const pagesText = buildChecklistPagesText(pages);
  if (!pagesText.trim()) {
    return { items: [], model: CLAUDE_FAST_MODEL };
  }

  const result = await callClaude({
    model: CLAUDE_FAST_MODEL,
    system: EXTRACT_SYSTEM_PROMPT,
    userBlocks: [{ type: "text", text: pagesText }],
    maxOutputTokens: 8_192,
    timeoutMs: 120_000,
  });

  const fallback = pages[0] ? { fileName: pages[0].fileName, page: pages[0].page } : undefined;
  return { items: parseExtractedItems(result.text, fallback), model: result.model };
}
