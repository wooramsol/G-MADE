import assert from "node:assert/strict";
import test from "node:test";
import { buildPdfPageMarkedText } from "../lib/ai/page-citation";
import type { UploadedFileSummary } from "../lib/ai/uploaded-file";
import { classifyRgba, mergeOcrIntoFiles, snapBoxToInk } from "../lib/checklist-review/drawing-ocr";
import { formatOcrLinesForText, locateAnchorInOcr, type OcrLine } from "../lib/pdf/ocr-locate";

const line = (t: string, x: number, y: number, s: 0 | 1 = 1): OcrLine => ({ t, x, y, w: 0.05, h: 0.015, s });

test("OCR 앵커: 정밀 좌표면 precise, 근사 좌표면 박스 없음", () => {
  const lines = [line("주출입구", 0.1, 0.1, 1), line("3,600", 0.5, 0.5, 0)];
  assert.equal(locateAnchorInOcr(lines, ["주출입구"])?.precise, true);
  assert.equal(locateAnchorInOcr(lines, ["3,600"])?.precise, false);
  assert.equal(locateAnchorInOcr(lines, ["없는문구"]), null);
});

test("OCR 앵커: 멀리 떨어진 줄끼리 우연히 이어진 일치는 거부", () => {
  const lines = [line("옥상", 0.05, 0.05), line("조경", 0.9, 0.9)];
  assert.equal(locateAnchorInOcr(lines, ["옥상조경"]), null);
  const near = [line("옥상", 0.4, 0.4), line("조경", 0.46, 0.4)];
  assert.ok(locateAnchorInOcr(near, ["옥상조경"]));
});

test("OCR 앵커: 여러 곳 일치 시 힌트에 가까운 쪽", () => {
  const lines = [line("화장실", 0.1, 0.1), line("화장실", 0.8, 0.8)];
  const found = locateAnchorInOcr(lines, ["화장실"], { x: 0.75, y: 0.75, width: 0.1, height: 0.1 });
  assert.ok(found && found.region.x > 0.5);
});

test("판독 텍스트는 위→아래, 왼→오른 순서", () => {
  const text = formatOcrLinesForText([line("B", 0.6, 0.1), line("C", 0.1, 0.5), line("A", 0.1, 0.1)]);
  assert.equal(text, "A / B / C");
});

test("도면/사진 분류", () => {
  const white = new Uint8ClampedArray(400 * 4).fill(255);
  assert.equal(classifyRgba(white), "drawing");
  const photo = new Uint8ClampedArray(400 * 4);
  for (let i = 0; i < photo.length; i += 4) {
    photo[i] = 40;
    photo[i + 1] = 120;
    photo[i + 2] = 200;
    photo[i + 3] = 255;
  }
  assert.equal(classifyRgba(photo), "photo");
});

test("잉크 보정: 글자에 맞게 조이고, 긴 선은 제외, 엉뚱한 박스는 실패", () => {
  const width = 200;
  const height = 100;
  const data = new Uint8Array(width * height).fill(255);
  for (let y = 40; y < 55; y += 1) for (let x = 80; x < 120; x += 1) data[y * width + x] = 0; // 글자 덩어리
  for (let x = 0; x < width; x += 1) data[58 * width + x] = 0; // 치수선
  const gray = { data, width, height };
  const snapped = snapBoxToInk(gray, { x0: 74, y0: 36, x1: 126, y1: 60 });
  assert.deepEqual(snapped, { x0: 80, y0: 40, x1: 120, y1: 55 });
  assert.equal(snapBoxToInk(gray, { x0: 5, y0: 5, x1: 30, y1: 20 }), null);
});

test("판독 텍스트가 페이지 표시 텍스트에 합쳐짐 (빈 페이지 포함)", () => {
  const file: UploadedFileSummary = {
    id: "f1",
    originalName: "도서.pdf",
    fileType: "pdf",
    sizeBytes: 1,
    extractedTextPreview: buildPdfPageMarkedText("도서.pdf", ["표지", "", "본문"]),
    totalPages: 3,
  } as UploadedFileSummary;
  mergeOcrIntoFiles([file], new Map([["f1", new Map([[2, [line("1층 평면도", 0.1, 0.1)]]])]]));
  assert.match(file.extractedTextPreview ?? "", /p\.2 ---\n\[도면 판독 텍스트\] 1층 평면도/);
  assert.match(file.extractedTextPreview ?? "", /p\.3 ---\n본문/);
});

import { stabilizeFindings } from "../lib/checklist-review/judgment-stability";
import type { ChecklistFinding } from "../lib/checklist-review/types";

const finding = (itemId: string, status: ChecklistFinding["status"], extra: Partial<ChecklistFinding> = {}): ChecklistFinding => ({
  itemId,
  status,
  rationale: "근거",
  evidence: [{ fileName: "a.pdf", page: 1, note: "확인" }],
  lawRefs: [],
  ...extra,
});

test("판정 안정화: 근거 없는 변경은 이전 판정으로 복원", () => {
  const prior = new Map([["c1", finding("c1", "충족", { rationale: "이전 근거" })]]);
  const { findings, reverted } = stabilizeFindings([finding("c1", "확인불가")], prior);
  assert.equal(findings[0].status, "충족");
  assert.equal(findings[0].rationale, "이전 근거");
  assert.deepEqual(reverted, ["c1"]);
});

test("판정 안정화: [판정 변경]+원문 인용 또는 확대 판독 근거면 변경 인정", () => {
  const prior = new Map([
    ["c1", finding("c1", "충족")],
    ["c2", finding("c2", "확인불가")],
  ]);
  const marked = finding("c1", "부분충족", {
    rationale: "[판정 변경] 이전 충족→부분충족: AL SHEET 고광택 가능성",
    evidence: [{ fileName: "a.pdf", page: 6, note: "보조색 재료", anchorText: "AL SHEET" }],
  });
  const zoom = finding("c2", "충족", { evidence: [{ fileName: "a.pdf", page: 8, note: "확대 판독: H: N / V: 7이상" }] });
  const { findings, changed, reverted } = stabilizeFindings([marked, zoom], prior);
  assert.equal(findings[0].status, "부분충족");
  assert.equal(findings[1].status, "충족");
  assert.deepEqual(changed, ["c1", "c2"]);
  assert.equal(reverted.length, 0);
});
