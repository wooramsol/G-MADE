import { isTocPageText, parsePageSlices, type PageSlice } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";

const CHECKLIST_PATTERN = /체\s*크\s*리\s*스\s*트|check\s*list/i;

/**
 * 추출 텍스트 레이어에서 '체크리스트' 페이지를 찾습니다.
 * 목차 페이지(체크리스트 언급만 있는)는 제외합니다.
 */
export function findChecklistPages(files: UploadedFileSummary[]): PageSlice[] {
  const slices = parsePageSlices(files);

  return slices.filter((slice) => {
    const text = slice.text.trim();
    if (!text) return false;
    if (!CHECKLIST_PATTERN.test(text)) return false;
    if (isTocPageText(text)) return false;

    // 제목·머리말 영역(앞부분)에 등장하거나, 표 형태로 항목이 나열된 페이지만 인정
    const headZone = text.slice(0, 200);
    if (CHECKLIST_PATTERN.test(headZone)) return true;

    // 본문 중간 언급이라도 체크 표기(□ ■ ☑ ○ ●, 반영/미반영 등)가 여러 개면 체크리스트로 간주
    const checkSignals = (text.match(/[□■☑☐○●∨✓]|반영\s*여부|해당\s*없음|미반영/g) ?? []).length;
    return checkSignals >= 3;
  });
}

/** 체크리스트 페이지들의 텍스트를 프롬프트용으로 합칩니다. */
export function buildChecklistPagesText(pages: PageSlice[], maxChars = 24_000): string {
  const parts: string[] = [];
  let used = 0;

  for (const page of pages) {
    const header = `--- 「${page.fileName}」 p.${page.page} ---`;
    const body = page.text.trim();
    const chunk = `${header}\n${body}`;
    if (used + chunk.length > maxChars) break;
    parts.push(chunk);
    used += chunk.length;
  }

  return parts.join("\n\n");
}
