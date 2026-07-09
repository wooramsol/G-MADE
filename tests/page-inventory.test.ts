import assert from "node:assert/strict";
import { test } from "node:test";
import type { UploadedFileSummary } from "../lib/ai/analysis-types";
import { buildPageInventory, countPageInventoryEntries } from "../lib/ai/page-inventory";

function makePdfFile(corpus: string, name = "심의도서.pdf", totalPages = 20): UploadedFileSummary {
  return {
    id: "file-1",
    originalName: name,
    fileType: "application/pdf",
    sizeBytes: corpus.length,
    storagePath: "",
    extractedTextPreview: corpus,
    totalPages,
    visionAssets: [{ label: `${name} (전체 PDF)`, mediaType: "application/pdf", base64: "abc" }],
  };
}

test("buildPageInventory classifies toc, title divider, and drawing pages", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.2 ---",
    "목차",
    "01 사업개요 ........ 3",
    "02 경관자원 ........ 5",
    "03 배치도 .......... 12",
    "",
    "--- 「심의도서.pdf」 p.5 ---",
    "02 경관자원 및 경관특성",
    "",
    "--- 「심의도서.pdf」 p.12 ---",
    "배치도",
    "주차장 12면",
    "보행 동선 및 진입로",
    "연면적 245㎡",
  ].join("\n");

  const inventory = buildPageInventory([makePdfFile(corpus, "심의도서.pdf", 12)]);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0]?.pages.length, 3);

  const tocPage = inventory[0]?.pages.find((page) => page.page === 2);
  assert.equal(tocPage?.contentKind, "목차");
  assert.match(tocPage?.detectedElements.join(" ") ?? "", /목차/);

  const titlePage = inventory[0]?.pages.find((page) => page.page === 5);
  assert.equal(titlePage?.contentKind, "제목·구분");

  const drawingPage = inventory[0]?.pages.find((page) => page.page === 12);
  assert.equal(drawingPage?.contentKind, "도면·본문");
  assert.equal(drawingPage?.sectionLabel, "배치도");
  assert.ok((drawingPage?.drawingScore ?? 0) >= 3);
});

test("buildPageInventory fills empty pages for scan PDF without text layer", () => {
  const inventory = buildPageInventory([
    makePdfFile('[PDF 텍스트 레이어 없음] "scan.pdf" — 배치도·입면도·스캔 문서는 첨부 PDF 비전 자료로 분석합니다.', "scan.pdf", 4),
  ]);

  assert.equal(inventory[0]?.pages.length, 4);
  assert.equal(inventory[0]?.pages[0]?.contentKind, "이미지·스캔");
  assert.equal(inventory[0]?.pages[1]?.contentKind, "이미지·스캔");
  assert.match(inventory[0]?.notes.join(" ") ?? "", /텍스트 레이어/);
});

test("countPageInventoryEntries sums pages across files", () => {
  const inventory = buildPageInventory([
    makePdfFile("--- 「a.pdf」 p.1 ---\n본문", "a.pdf", 1),
    makePdfFile("--- 「b.pdf」 p.1 ---\n본문\n\n--- 「b.pdf」 p.2 ---\n추가", "b.pdf", 2),
  ]);
  assert.equal(countPageInventoryEntries(inventory), 3);
});
