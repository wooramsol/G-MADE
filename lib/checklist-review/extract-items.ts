import { CLAUDE_FAST_MODEL } from "@/lib/ai/claude-models";
import { extractJsonContent } from "@/lib/ai/extract-json";
import type { PageSlice } from "@/lib/ai/page-citation";
import { callClaude, type ClaudeUsage } from "./claude-call";
import { buildChecklistPagesText } from "./find-checklist-pages";
import type { ChecklistItem } from "./types";

const EXTRACT_SYSTEM_PROMPT = `당신은 경관·공공디자인 심의 문서에서 체크리스트 항목을 추출하는 도구입니다.
입력은 PDF에서 추출한 '체크리스트' 페이지들의 텍스트입니다. 페이지 구분은 --- 「파일명」 p.N --- 형식입니다.
규칙:
- 체크리스트 표의 '항목(점검 내용)'만 추출합니다. 머리말, 열 제목(반영여부·비고 등), 페이지 번호, 범례는 제외합니다.
- 표 제목·페이지 제목(예: "체크리스트[건축물]_2035○○시경관계획")은 항목이 아니므로 절대 추출하지 않습니다. 점검 항목 본문이 텍스트에 없으면 빈 배열을 출력합니다.
- 경관·공공디자인 분야의 체크리스트만 추출합니다. 건축계획·구조·소방·에너지 등 다른 분야의 체크리스트가 섞여 있으면 그 항목들은 전부 제외합니다.
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

/**
 * 응답이 max_tokens로 잘려 JSON 배열이 닫히지 않은 경우, 마지막으로 완성된 객체까지만
 * 잘라 배열을 닫고 복구합니다. 항목이 하나도 복구되지 않는 것보다 완성된 앞부분이라도
 * 살리는 편이 낫습니다 — 복구 실패(0개)로 처리되면 문서 전체를 비전으로 추출+평가하는
 * 훨씬 느린 폴백 경로로 빠져 서버 시간 한도를 초과할 수 있습니다.
 */
function salvageTruncatedItemsArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  if (start < 0) return null;
  const slice = raw.slice(start);
  const lastClose = slice.lastIndexOf("}");
  if (lastClose < 0) return null;
  const candidate = `${slice.slice(0, lastClose + 1).replace(/,\s*$/, "")}]`;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseExtractedItems(raw: string, fallbackPage?: { fileName: string; page: number }): ChecklistItem[] {
  const json = extractJsonContent(raw);

  let parsed: unknown = null;
  if (json) {
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed)) {
    parsed = salvageTruncatedItemsArray(raw);
    if (Array.isArray(parsed)) {
      console.warn(`[checklist-review] 항목 추출 응답이 잘려 복구 파싱 사용 — 복구된 항목=${parsed.length}`);
    }
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
  usage?: ClaudeUsage;
}> {
  const pagesText = buildChecklistPagesText(pages);
  if (!pagesText.trim()) {
    return { items: [], model: CLAUDE_FAST_MODEL };
  }

  const result = await callClaude({
    model: CLAUDE_FAST_MODEL,
    system: EXTRACT_SYSTEM_PROMPT,
    userBlocks: [{ type: "text", text: pagesText }],
    // 대형 도서는 체크리스트 항목이 80개를 넘기도 함 — 8192로는 잘려서(items=0 오인 ->
    // 문서 전체 비전 추출+평가 폴백 -> 서버 시간 한도 초과) 검토가 실패한 사례가 있어 확대.
    maxOutputTokens: 16_384,
    timeoutMs: 120_000,
  });

  if (result.stopReason === "max_tokens") {
    console.warn("[checklist-review] 항목 추출 응답이 max_tokens로 잘림 — 복구 파싱으로 진행");
  }

  const fallback = pages[0] ? { fileName: pages[0].fileName, page: pages[0].page } : undefined;
  return { items: parseExtractedItems(result.text, fallback), model: result.model, usage: result.usage };
}
