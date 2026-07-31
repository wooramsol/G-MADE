import { isTocPageText, parsePageSlices, type PageSlice } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";

const CHECKLIST_PATTERN = /체\s*크\s*리\s*스\s*트|check\s*list/i;
/** 경관·공공디자인 분야 표기 */
const LANDSCAPE_PATTERN = /경\s*관|공\s*공\s*디\s*자\s*인/;
/** 경관 심의와 무관한 타 분야 체크리스트 표기 (제목부 기준) */
const OTHER_DOMAIN_PATTERN = /건\s*축\s*계\s*획|건\s*축\s*심\s*의|구\s*조|소\s*방|피\s*난|에\s*너\s*지|전\s*기|기\s*계\s*설\s*비|범\s*죄\s*예\s*방|교\s*통/;

/**
 * 추출 텍스트 레이어에서 '경관·공공디자인' 체크리스트 페이지를 찾습니다.
 * 목차 페이지(체크리스트 언급만 있는)는 제외합니다.
 *
 * 제출 도서에 건축계획 등 다른 분야의 체크리스트가 함께 실려 있는 경우가 있어(합본 도서),
 * 제목부에 경관·공공디자인 표기가 있는 페이지가 하나라도 있으면 그 페이지들만 사용합니다.
 * 경관 표기가 전혀 없으면(체크리스트가 하나뿐인 일반적인 경관심의 도서) 타 분야가 명시된
 * 페이지만 제외하고 나머지를 사용합니다 — 잘못 제외해 항목을 놓치는 것보다 보수적으로.
 */
export function findChecklistPages(files: UploadedFileSummary[]): PageSlice[] {
  const slices = parsePageSlices(files);

  const candidates = slices.filter((slice) => {
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

  const headZoneOf = (slice: PageSlice) => slice.text.trim().slice(0, 200);
  const landscapePages = candidates.filter((slice) => LANDSCAPE_PATTERN.test(headZoneOf(slice)));
  if (landscapePages.length > 0) {
    if (landscapePages.length < candidates.length) {
      console.log(
        `[checklist-review] 체크리스트 페이지 ${candidates.length}개 중 경관 분야 ${landscapePages.length}개만 사용 ` +
          `(제외: ${candidates
            .filter((slice) => !landscapePages.includes(slice))
            .map((slice) => `p.${slice.page}`)
            .join(",")})`,
      );
    }
    return landscapePages;
  }

  // 경관 표기가 전혀 없으면 타 분야가 명시된 페이지만 제외
  const withoutOtherDomains = candidates.filter(
    (slice) => !(OTHER_DOMAIN_PATTERN.test(headZoneOf(slice)) && !LANDSCAPE_PATTERN.test(headZoneOf(slice))),
  );
  return withoutOtherDomains.length > 0 ? withoutOtherDomains : candidates;
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
