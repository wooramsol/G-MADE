import assert from "node:assert/strict";
import { test } from "node:test";
import type { UploadedFileSummary } from "../lib/ai/analysis-types";
import {
  buildPageHintCorpusFromDocumentSections,
  findPageForSection,
  isTitleOnlyPageText,
  isTocPageText,
  pageCitationIsKnown,
  resolvePageEvidence,
  scoreDrawingPageText,
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

test("isTitleOnlyPageText detects chapter divider like p.5 경관자원", () => {
  assert.equal(isTitleOnlyPageText("02 경관자원 및 경관특성"), true);
  assert.equal(isTitleOnlyPageText("01 사업개요"), true);
});

test("resolvePageEvidence redirects p.5 divider page to next content page", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.5 ---",
    "02 경관자원 및 경관특성",
    "",
    "--- 「심의도서.pdf」 p.6 ---",
    "경관자원 분석",
    "주변 경관 현황 사진 및 위치도",
    "식생·지형 특성 표",
    "면적 1,240㎡",
  ].join("\n");

  const files = [makeFile(corpus)];
  const resolved = resolvePageEvidence(files, "p.5", "옥외 공간 관련 누락 도면");

  assert.match(resolved, /^p\.6(?:\s|$)/);
});

test("resolvePageEvidence does not keep bare p.5 for every point", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.5 ---",
    "02 경관자원 및 경관특성",
    "",
    "--- 「심의도서.pdf」 p.12 ---",
    "배치도",
    "주차장 12면 보행 동선",
    "",
    "--- 「심의도서.pdf」 p.18 ---",
    "야간경관 조명 계획",
    "조도 25lux 기준",
  ].join("\n");

  const files = [makeFile(corpus)];
  assert.equal(resolvePageEvidence(files, "p.5 배치도", "배치도 수치 미기재"), "p.12 배치도");
  assert.equal(resolvePageEvidence(files, "p.5", "야간 조명 기준 불명확"), "p.18 야간경관");
});

test("isTitleOnlyPageText detects section title divider page", () => {
  assert.equal(isTitleOnlyPageText("03 배치도"), true);
  assert.equal(
    isTitleOnlyPageText(
      "배치도\n주차장 12면\n보행 동선 및 진입로\n연면적 245㎡",
      "배치도",
    ),
    false,
  );
});

test("findPageForSection skips title-only page and finds next drawing page", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.13 ---",
    "03 배치도",
    "",
    "--- 「심의도서.pdf」 p.14 ---",
    "배치도",
    "주차장 12면",
    "보행 동선 및 진입로",
    "연면적 245㎡",
  ].join("\n");

  const files = [makeFile(corpus)];
  const located = findPageForSection(files, ["배치도"]);

  assert.ok(located);
  assert.equal(located.page, 14);
  assert.equal(scoreDrawingPageText("03 배치도", "배치도"), -1);
});

test("resolvePageEvidence corrects p.13 title page to actual drawing page", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.13 ---",
    "03 배치도",
    "",
    "--- 「심의도서.pdf」 p.14 ---",
    "배치도",
    "주차장 12면",
    "보행 동선",
    "연면적 245㎡",
  ].join("\n");

  const files = [makeFile(corpus)];
  const resolved = resolvePageEvidence(files, "p.13 배치도", "스카이라인 연속성 불명확");

  assert.equal(resolved, "p.14 배치도");
});

test("buildPageHintCorpus marks shared index page when many sections cite same page", () => {
  const corpus = buildPageHintCorpusFromDocumentSections(
    [
      { label: "배치도", summary: "1. 「심의도서.pdf」 p.13 배치도" },
      { label: "입면도", summary: "1. 「심의도서.pdf」 p.13 입면도" },
      { label: "조감도", summary: "1. 「심의도서.pdf」 p.13 조감도" },
      { label: "배치도", summary: "2. 「심의도서.pdf」 p.18 배치도 — 주차·동선 표기" },
    ],
    "심의도서.pdf",
  );

  assert.match(corpus, /--- 「심의도서.pdf」 p\.13 ---\n목차/);

  const files = [makeFile(corpus)];
  const located = findPageForSection(files, ["배치도"]);
  assert.equal(located?.page, 18);
});

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


test("resolvePageEvidence relocates mismatched p.14 배치도 using item content keywords", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.14 ---",
    "배치도",
    "주차장 12면",
    "보행 동선",
    "",
    "--- 「심의도서.pdf」 p.20 ---",
    "색채계획",
    "주조색 N7",
    "강조색 팔레트",
  ].join("\n");

  const files = [makeFile(corpus)];
  const resolved = resolvePageEvidence(
    files,
    "p.14 배치도",
    "주조색·강조색 팔레트 미기재",
    ["색채", "주조색", "색채계획"],
  );

  assert.equal(resolved, "p.20 색채계획");
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
