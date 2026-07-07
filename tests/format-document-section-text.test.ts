import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseSpacedHangulSyllables,
  dropDocumentSectionFragmentLines,
  formatDocumentSectionText,
} from "../lib/format-document-section-text";

test("collapseSpacedHangulSyllables merges OCR syllable gaps", () => {
  assert.equal(collapseSpacedHangulSyllables("반 영 미 반 영"), "반영미반영");
  assert.equal(collapseSpacedHangulSyllables("보행 동선"), "보행 동선");
});

test("dropDocumentSectionFragmentLines removes hanging fragments", () => {
  const input = ["1. 「test.pdf」 p.12 배치도 — 내용 확인", "● 고", "● 주변"].join("\n");
  const output = dropDocumentSectionFragmentLines(input);
  assert.match(output, /p\.12 배치도/);
  assert.doesNotMatch(output, /● 고/);
  assert.doesNotMatch(output, /^주변$/m);
});

test("formatDocumentSectionText cleans bullets and page markers", () => {
  const input = [
    "● 반 영 미 반 영 해 당 없 음",
    "--- 「심의도서.pdf」 p.12 ---",
    "● 고",
  ].join("\n");

  const output = formatDocumentSectionText(input);
  assert.match(output, /반영미반영해당없음|반영미/);
  assert.match(output, /「심의도서\.pdf」 p\.12/);
  assert.doesNotMatch(output, /---/);
  assert.doesNotMatch(output, /●/);
});
