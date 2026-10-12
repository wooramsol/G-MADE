/**
 * 도면 OCR 결과(이미지 속 글자 + 위치)에서 인용구(앵커)를 찾아 정규화 좌표 영역을
 * 돌려준다 — 텍스트 레이어가 없는 스캔 도면에서도 근거 위치를 표시하기 위함.
 *
 * precise=true는 일치한 모든 줄이 픽셀 기준으로 보정(snap)된 경우에만 — 이때만 화면에
 * 빨간 박스를 그린다. 보정되지 않은 좌표(AI 추정치)는 크롭 위치로만 쓰고 박스는
 * 그리지 않는다 (과거 "잘못된 박스" 피드백 재발 방지).
 */

import type { NormalizedRegion } from "./text-locate";

export type OcrLine = {
  /** 판독 문자열 */
  t: string;
  /** 페이지 정규화 좌표 (0~1, 좌상단 원점) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1 = 실제 잉크 픽셀에 맞춰 보정됨(정밀), 0 = AI 추정 좌표 */
  s: 0 | 1;
};

function normalizeForSearch(text: string): string {
  return text.replace(/\s+/g, "");
}

function union(lines: OcrLine[]): NormalizedRegion {
  const minX = Math.min(...lines.map((line) => line.x));
  const minY = Math.min(...lines.map((line) => line.y));
  const maxX = Math.max(...lines.map((line) => line.x + line.w));
  const maxY = Math.max(...lines.map((line) => line.y + line.h));
  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.min(1, maxX) - Math.max(0, minX),
    height: Math.min(1, maxY) - Math.max(0, minY),
  };
}

export function locateAnchorInOcr(
  lines: OcrLine[],
  anchors: string[],
  hint?: NormalizedRegion | null,
): { region: NormalizedRegion; precise: boolean } | null {
  if (lines.length === 0 || anchors.length === 0) return null;

  let concat = "";
  const charLine: number[] = [];
  lines.forEach((line, index) => {
    const normalized = normalizeForSearch(line.t);
    for (let c = 0; c < normalized.length; c += 1) charLine.push(index);
    concat += normalized;
  });
  if (!concat) return null;

  const sorted = [...anchors].sort((a, b) => b.length - a.length);
  for (const anchor of sorted) {
    const needle = normalizeForSearch(anchor);
    if (needle.length < 2) continue;

    const matches: Array<{ region: NormalizedRegion; precise: boolean }> = [];
    let from = 0;
    while (matches.length < 8) {
      const at = concat.indexOf(needle, from);
      if (at === -1) break;
      from = at + 1;
      const first = charLine[at];
      const last = charLine[Math.min(at + needle.length - 1, charLine.length - 1)];
      const hit = lines.slice(first, last + 1);
      // 여러 줄에 걸친 일치는 서로 가까울 때만 인정 (멀리 떨어진 라벨끼리 우연히 이어진 경우 배제)
      const region = union(hit);
      if (hit.length > 1 && (region.width > 0.35 || region.height > 0.12)) continue;
      matches.push({ region, precise: hit.every((line) => line.s === 1) });
    }
    if (matches.length === 0) continue;
    if (matches.length === 1 || !hint) return matches[0];

    const hx = hint.x + hint.width / 2;
    const hy = hint.y + hint.height / 2;
    let best = matches[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const match of matches) {
      const dx = match.region.x + match.region.width / 2 - hx;
      const dy = match.region.y + match.region.height / 2 - hy;
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

/** 판독 줄들을 읽는 순서(위→아래, 왼→오른)의 텍스트 블록으로 — 평가용 추출 텍스트에 덧붙임 */
export function formatOcrLinesForText(lines: OcrLine[], maxChars = 4_000): string {
  const ordered = [...lines].sort((a, b) => {
    const rowA = Math.round((a.y + a.h / 2) * 60);
    const rowB = Math.round((b.y + b.h / 2) * 60);
    return rowA - rowB || a.x - b.x;
  });
  let out = "";
  for (const line of ordered) {
    const text = line.t.trim();
    if (!text) continue;
    const next = out ? `${out} / ${text}` : text;
    if (next.length > maxChars) break;
    out = next;
  }
  return out;
}
