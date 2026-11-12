/**
 * 근사 위치(AI가 알려준 글자 박스) 주변에서 실제 글자 덩어리를 찾아 정확한 박스를 돌려준다.
 *
 * 도면 글자 판독(OCR) 모델은 글자는 읽어도 위치는 조금씩 빗나간다(라벨 옆 빈 곳을 가리킴).
 * 빗나간 박스를 그대로 그리면 "판독이 틀린 것"처럼 보이므로, 주변 픽셀에서
 *  ① 긴 선(지시선·치수선·벽선)을 지우고
 *  ② 가로로 이어진 글자 덩어리(한 줄 라벨)를 묶은 뒤
 *  ③ 크기가 원래 박스와 비슷한 덩어리 중 가장 가까운 것을 고른다.
 * 후보가 애매하면(비슷한 거리의 다른 라벨이 있으면) 찾지 못한 것으로 처리한다 — 엉뚱한 라벨에
 * "정확" 표시를 붙이는 것보다 "근사"로 남기는 편이 안전하다.
 */

export type GrayImage = { data: Uint8Array; width: number; height: number };
export type PixelBox = { x0: number; y0: number; x1: number; y1: number };

const INK_THRESHOLD = 150;

export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p += 1) {
    const a = rgba[i + 3] / 255;
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    data[p] = Math.round(lum * a + 255 * (1 - a));
  }
  return { data, width, height };
}

export function findTextBoxNear(gray: GrayImage, approx: PixelBox): PixelBox | null {
  const bw = approx.x1 - approx.x0;
  const bh = approx.y1 - approx.y0;
  if (bw < 6 || bh < 4) return null;

  // 탐색 창 — 위치 오차를 흡수할 만큼 넓게 (세로는 글자 높이의 여러 배, 가로는 박스 폭만큼)
  const mx = Math.round(Math.max(bw, bh * 6));
  const my = Math.round(Math.max(bh * 6, bw * 0.5));
  const wx0 = Math.max(0, Math.floor(approx.x0 - mx));
  const wy0 = Math.max(0, Math.floor(approx.y0 - my));
  const wx1 = Math.min(gray.width, Math.ceil(approx.x1 + mx));
  const wy1 = Math.min(gray.height, Math.ceil(approx.y1 + my));
  const ww = wx1 - wx0;
  const wh = wy1 - wy0;
  if (ww < 8 || wh < 8 || ww * wh > 6_000_000) return null;

  const ink = new Uint8Array(ww * wh);
  for (let y = 0; y < wh; y += 1) {
    const row = (wy0 + y) * gray.width + wx0;
    for (let x = 0; x < ww; x += 1) if (gray.data[row + x] < INK_THRESHOLD) ink[y * ww + x] = 1;
  }

  // ① 긴 선 제거 — 글자 획보다 훨씬 긴 가로/세로 연속 픽셀
  const maxHRun = Math.max(12, Math.round(bh * 2.5));
  const maxVRun = Math.max(10, Math.round(bh * 1.7));
  const keep = new Uint8Array(ink);
  for (let y = 0; y < wh; y += 1) {
    let x = 0;
    while (x < ww) {
      if (!ink[y * ww + x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < ww && ink[y * ww + end]) end += 1;
      if (end - x > maxHRun) for (let i = x; i < end; i += 1) keep[y * ww + i] = 0;
      x = end;
    }
  }
  for (let x = 0; x < ww; x += 1) {
    let y = 0;
    while (y < wh) {
      if (!ink[y * ww + x]) {
        y += 1;
        continue;
      }
      let end = y;
      while (end < wh && ink[end * ww + x]) end += 1;
      if (end - y > maxVRun) for (let i = y; i < end; i += 1) keep[i * ww + x] = 0;
      y = end;
    }
  }

  // ② 가로로 이어 붙여 덩어리 만들기 — 글자 사이·낱말 사이 간격까지 한 줄로 묶음
  const gap = Math.max(3, Math.round(bh * 0.9));
  type Run = { x0: number; x1: number; id: number };
  const parent: number[] = [];
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const boxes: PixelBox[] = [];
  let prev: Run[] = [];
  for (let y = 0; y < wh; y += 1) {
    const runs: Run[] = [];
    let x = 0;
    while (x < ww) {
      if (!keep[y * ww + x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < ww && keep[y * ww + end]) end += 1;
      const last = runs[runs.length - 1];
      if (last && x - last.x1 <= gap) last.x1 = end;
      else runs.push({ x0: x, x1: end, id: -1 });
      x = end;
    }
    for (const run of runs) {
      for (const above of prev) {
        if (above.x1 <= run.x0 || above.x0 >= run.x1) continue;
        const root = find(above.id);
        if (run.id === -1) run.id = root;
        else if (find(run.id) !== root) parent[root] = find(run.id);
      }
      if (run.id === -1) {
        run.id = parent.length;
        parent.push(run.id);
        boxes.push({ x0: run.x0, y0: y, x1: run.x1, y1: y + 1 });
      }
      const box = boxes[run.id];
      box.x0 = Math.min(box.x0, run.x0);
      box.x1 = Math.max(box.x1, run.x1);
      box.y1 = y + 1;
    }
    prev = runs;
  }
  const merged = new Map<number, PixelBox>();
  boxes.forEach((box, id) => {
    const root = find(id);
    const current = merged.get(root);
    if (!current) merged.set(root, { ...box });
    else {
      current.x0 = Math.min(current.x0, box.x0);
      current.y0 = Math.min(current.y0, box.y0);
      current.x1 = Math.max(current.x1, box.x1);
      current.y1 = Math.max(current.y1, box.y1);
    }
  });

  // ③ 크기가 비슷한 덩어리 중 가장 가까운 것
  const cx = (approx.x0 + approx.x1) / 2 - wx0;
  const cy = (approx.y0 + approx.y1) / 2 - wy0;
  const candidates: Array<{ box: PixelBox; distance: number }> = [];
  for (const box of merged.values()) {
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    if (w < bw * 0.5 || w > bw * 1.8 || h < bh * 0.4 || h > bh * 2.2) continue;
    // 탐색 창 가장자리에 걸리거나 바짝 붙은 덩어리는 창 밖으로 이어지는(잘린) 글자일 수 있어 제외
    if (box.x0 <= gap || box.y0 <= 0 || box.x1 >= ww - gap || box.y1 >= wh) continue;
    const dx = (box.x0 + box.x1) / 2 - cx;
    const dy = (box.y0 + box.y1) / 2 - cy;
    candidates.push({ box, distance: Math.hypot(dx, dy) });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  const second = candidates[1];
  // 비슷한 거리에 다른 후보가 있으면 어느 쪽인지 단정하지 않음
  if (second && second.distance < best.distance * 1.6 + bh) return null;
  return { x0: wx0 + best.box.x0, y0: wy0 + best.box.y0, x1: wx0 + best.box.x1, y1: wy0 + best.box.y1 };
}
