/**
 * PDF 글자 좌표 탐색 — 페이지의 텍스트 레이어에서 인용구(앵커)를 찾아
 * 정규화 좌표(0~1, 좌상단 원점)의 정확한 영역을 돌려준다.
 *
 * 도면도 벡터 PDF라면 라벨·명칭이 텍스트로 박혀 있어 동일하게 동작한다.
 * 스캔본(텍스트 레이어 없음)이나 인용구 불일치 시 null — 호출부는 AI 추정
 * 영역 크롭으로 폴백한다.
 */

export type NormalizedRegion = { x: number; y: number; width: number; height: number };

type TextItemLike = { str?: string; transform?: number[]; width?: number; height?: number };

type PdfPageLike = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  // pdf.js의 items는 TextItem | TextMarkedContent 유니온 — 구조를 느슨하게 받는다
  getTextContent: () => Promise<{ items: unknown[] }>;
};

/** 검색 정규화 — 공백 제거(줄바꿈·자간 분절 대응) */
function normalizeForSearch(text: string): string {
  return text.replace(/\s+/g, "");
}

export async function locateAnchorRegion(
  page: PdfPageLike,
  anchors: string[],
  /** AI 추정 영역 — 같은 문구가 여러 번 나올 때 가장 가까운 일치를 선택 */
  hint?: NormalizedRegion | null,
): Promise<NormalizedRegion | null> {
  if (anchors.length === 0) return null;

  let content;
  try {
    content = await page.getTextContent();
  } catch {
    return null;
  }
  const viewport = page.getViewport({ scale: 1 });
  const viewWidth = Math.max(viewport.width, 1);
  const viewHeight = Math.max(viewport.height, 1);

  // 아이템 문자열을 이어붙인 검색 문자열 + 문자 위치 → 아이템 인덱스 매핑
  const items = (content.items as TextItemLike[]).filter(
    (item) => typeof item?.str === "string" && item.str.trim().length > 0,
  );
  let concat = "";
  const charItemIndex: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const normalized = normalizeForSearch(items[index].str ?? "");
    for (let c = 0; c < normalized.length; c += 1) charItemIndex.push(index);
    concat += normalized;
  }
  if (concat.length === 0) return null;

  const itemRegion = (index: number): NormalizedRegion | null => {
    const item = items[index];
    const transform = item.transform;
    if (!transform || transform.length < 6) return null;
    const width = Math.abs(item.width ?? 0);
    const height = Math.abs(item.height ?? 0) || Math.abs(transform[3]) || 10;
    const x = transform[4];
    const yBaseline = transform[5];
    return {
      x: x / viewWidth,
      // PDF 좌표계는 좌하단 원점 — 화면(좌상단 원점) 기준으로 변환
      y: 1 - (yBaseline + height) / viewHeight,
      width: Math.max(width / viewWidth, 0.002),
      height: Math.max(height / viewHeight, 0.002),
    };
  };

  const unionRegions = (regions: NormalizedRegion[]): NormalizedRegion => {
    const minX = Math.min(...regions.map((r) => r.x));
    const minY = Math.min(...regions.map((r) => r.y));
    const maxX = Math.max(...regions.map((r) => r.x + r.width));
    const maxY = Math.max(...regions.map((r) => r.y + r.height));
    return {
      x: Math.max(0, minX),
      y: Math.max(0, minY),
      width: Math.min(1, maxX) - Math.max(0, minX),
      height: Math.min(1, maxY) - Math.max(0, minY),
    };
  };

  // 긴(더 구체적인) 앵커부터 시도
  const sorted = [...anchors].sort((a, b) => b.length - a.length);
  for (const anchor of sorted) {
    const needle = normalizeForSearch(anchor);
    if (needle.length < 2) continue;

    // 모든 일치 위치 수집 (최대 8곳)
    const matches: NormalizedRegion[] = [];
    let from = 0;
    while (matches.length < 8) {
      const at = concat.indexOf(needle, from);
      if (at === -1) break;
      from = at + 1;
      const first = charItemIndex[at];
      const last = charItemIndex[Math.min(at + needle.length - 1, charItemIndex.length - 1)];
      const regions: NormalizedRegion[] = [];
      for (let index = first; index <= last; index += 1) {
        const region = itemRegion(index);
        if (region) regions.push(region);
      }
      if (regions.length > 0) matches.push(unionRegions(regions));
    }
    if (matches.length === 0) continue;

    if (matches.length === 1 || !hint) return matches[0];

    // 여러 곳에서 일치 — AI 추정 영역 중심에 가장 가까운 것
    const hintCenterX = hint.x + hint.width / 2;
    const hintCenterY = hint.y + hint.height / 2;
    let best = matches[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const match of matches) {
      const dx = match.x + match.width / 2 - hintCenterX;
      const dy = match.y + match.height / 2 - hintCenterY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = match;
      }
    }
    return best;
  }

  return null;
}
