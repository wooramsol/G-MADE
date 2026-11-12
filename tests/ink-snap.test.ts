import assert from "node:assert/strict";
import test from "node:test";
import { findTextBoxNear, type GrayImage } from "../lib/pdf/ink-snap";

function blank(width: number, height: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(255), width, height };
}
function fill(gray: GrayImage, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) gray.data[y * gray.width + x] = 0;
}
/** 글자 흉내 — 폭 8·간격 4의 블록을 가로로 나열 */
function label(gray: GrayImage, x: number, y: number, letters: number, height = 12) {
  for (let i = 0; i < letters; i += 1) fill(gray, x + i * 12, y, x + i * 12 + 8, y + height);
  return { x0: x, y0: y, x1: x + letters * 12 - 4, y1: y + height };
}

test("빗나간 근사 박스 → 주변의 실제 라벨로 보정 (지시선·기둥 기호는 무시)", () => {
  const gray = blank(900, 400);
  const truth = label(gray, 200, 200, 12);
  fill(gray, 270, 212, 272, 380); // 라벨에서 내려가는 지시선
  fill(gray, 100, 300, 800, 302); // 긴 가로선
  fill(gray, 330, 120, 360, 150); // 기둥 기호(작은 덩어리)
  const found = findTextBoxNear(gray, { x0: 260, y0: 140, x1: 400, y1: 154 });
  assert.ok(found);
  assert.ok(Math.abs(found.x0 - truth.x0) <= 2 && Math.abs(found.x1 - truth.x1) <= 2);
  assert.ok(Math.abs(found.y0 - truth.y0) <= 2 && Math.abs(found.y1 - truth.y1) <= 2);
});

test("비슷한 거리에 라벨이 둘이면 단정하지 않음 / 빈 곳은 못 찾음", () => {
  const gray = blank(900, 400);
  label(gray, 100, 200, 12);
  label(gray, 420, 200, 12);
  assert.equal(findTextBoxNear(gray, { x0: 262, y0: 200, x1: 402, y1: 212 }), null);
  assert.equal(findTextBoxNear(blank(600, 300), { x0: 200, y0: 100, x1: 340, y1: 112 }), null);
});
