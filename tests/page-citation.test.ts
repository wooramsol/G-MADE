import assert from "node:assert/strict";
import { test } from "node:test";
import type { UploadedFileSummary } from "../lib/ai/analysis-types";
import {
  buildPageHintCorpusFromDocumentSections,
  findPageForSection,
  isTocPageText,
  pageCitationIsKnown,
  resolvePageEvidence,
} from "../lib/ai/page-citation";

function makeFile(corpus: string, name = "심의도서.pdf"): UploadedFileSummary {
  return {
    id: "file-1",
    originalName: name,
    fileType: "application/pdf",
    sizeBytes: corpus.length,
    storagePath: "",
    extractedTextPreview: corpus,
    totalPages: 20,
  };
}

test("isTocPageText detects table of contents page", () => {
  const toc = [
    "목차",
    "1. 사업개요",
    "2. 배치도",
    "3. 입면도",
    "4. 조감도",
    "5. 색채계획",
    "6. 야간경관",
  ].join("\n");

  assert.equal(isTocPageText(toc), true);
  assert.equal(isTocPageText("배치도\n주차장 위치 및 진입 동선"), false);
});

test("findPageForSection skips TOC and finds actual drawing page", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.2 ---",
    "목차",
    "1. 사업개요",
    "2. 배치도",
    "3. 입면도",
    "",
    "--- 「심의도서.pdf」 p.12 ---",
    "배치도",
    "주차장 배치 및 보행 동선",
  ].join("\n");

  const files = [makeFile(corpus)];
  const located = findPageForSection(files, ["배치도"]);

  assert.ok(located);
  assert.equal(located.page, 12);
  assert.equal(located.sectionLabel, "배치도");
});

test("resolvePageEvidence corrects p.2 배치도 to actual drawing page", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.2 ---",
    "목차",
    "1. 사업개요",
    "2. 배치도",
    "3. 입면도",
    "4. 조감도",
    "5. 색채계획",
    "",
    "--- 「심의도서.pdf」 p.12 ---",
    "배치도",
    "주차장 배치",
  ].join("\n");

  const files = [makeFile(corpus)];
  const resolved = resolvePageEvidence(files, "p.2 배치도", "스카이라인 연속성 불명확");

  assert.equal(resolved, "p.12 배치도");
});

test("resolvePageEvidence replaces criteria-like evidence with page location", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.12 ---",
    "배치도",
    "주변 스카이라인과의 관계",
  ].join("\n");

  const files = [makeFile(corpus)];
  const resolved = resolvePageEvidence(
    files,
    "주변 스카이라인과 과도한 단절 없...",
    "스케일 조정 근거 불명확",
  );

  assert.equal(resolved, "p.12 배치도");
});

test("pageCitationIsKnown rejects TOC page for drawing citations", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.2 ---",
    "목차",
    "1. 사업개요",
    "2. 배치도",
    "3. 입면도",
    "4. 조감도",
    "5. 색채계획",
  ].join("\n");

  const files = [makeFile(corpus)];
  const known = pageCitationIsKnown({ fileName: "심의도서.pdf", page: 2 }, files);

  assert.equal(known, false);
});

test("buildPageHintCorpusFromDocumentSections creates page markers from summaries", () => {
  const corpus = buildPageHintCorpusFromDocumentSections(
    [
      {
        label: "목차",
        summary: "1. 「심의도서.pdf」 p.2 목차 — 사업개요·배치도 항목 나열",
      },
      {
        label: "배치도",
        summary: "1. 「심의도서.pdf」 p.12 배치도 — 주차·보행 동선 표기",
      },
    ],
    "심의도서.pdf",
  );

  assert.match(corpus, /--- 「심의도서.pdf」 p\.2 ---/);
  assert.match(corpus, /--- 「심의도서.pdf」 p\.12 ---/);

  const files = [makeFile(corpus)];
  const resolved = resolvePageEvidence(files, "p.2 배치도");
  assert.equal(resolved, "p.12 배치도");
});
