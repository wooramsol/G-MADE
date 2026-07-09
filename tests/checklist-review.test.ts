import assert from "node:assert/strict";
import test from "node:test";
import { buildPdfPageMarkedText } from "../lib/ai/page-citation";
import type { UploadedFileSummary } from "../lib/ai/uploaded-file";
import { sanitizeFindings } from "../lib/checklist-review/evaluate-items";
import { parseExtractedItems } from "../lib/checklist-review/extract-items";
import { findChecklistPages } from "../lib/checklist-review/find-checklist-pages";
import { countFindingStatuses, normalizeChecklistStatus } from "../lib/checklist-review/types";
import type { EvaluationContext } from "../lib/evaluation-context";

const FILE_NAME = "심의도서.pdf";

function buildFile(pageTexts: string[]): UploadedFileSummary {
  return {
    originalName: FILE_NAME,
    extractedTextPreview: buildPdfPageMarkedText(FILE_NAME, pageTexts),
    totalPages: pageTexts.length,
  };
}

function buildContext(): EvaluationContext {
  return {
    spatial: null,
    referenceLaws: [
      {
        id: "law-1",
        title: "경관법",
        article: "제28조",
        summary: "경관심의 대상",
        ministry: "국토교통부",
        enforcementDate: "",
        sourceUrl: "https://law.go.kr/법령/경관법",
        source: "law.go.kr",
      },
    ],
    referenceGuidelines: [],
    guidelines: [],
    lawSource: "law.go.kr",
    guidelineSource: "law.go.kr",
    fetchedAt: new Date().toISOString(),
    warnings: [],
  };
}

test("findChecklistPages는 체크리스트 제목 페이지를 찾는다", () => {
  const file = buildFile([
    "사업 개요\n위치: 서울특별시",
    "경관 체크리스트\n□ 스카이라인 검토 반영\n□ 야간경관 계획 반영\n□ 색채계획 반영",
    "배치도\n(도면)",
  ]);

  const pages = findChecklistPages([file]);
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.page, 2);
  assert.equal(pages[0]?.fileName, FILE_NAME);
});

test("findChecklistPages는 목차의 체크리스트 언급을 제외한다", () => {
  const file = buildFile([
    "목차\n1. 사업개요 ......... 3\n2. 체크리스트 ......... 5\n3. 도면 ......... 7",
    "본문 내용",
  ]);

  assert.equal(findChecklistPages([file]).length, 0);
});

test("parseExtractedItems는 JSON 배열을 항목으로 변환한다", () => {
  const raw = `[
    {"category": "배치", "text": "주변 가로와의 연속성을 확보하였는가", "fileName": "${FILE_NAME}", "page": 2},
    {"category": "", "text": "짧", "page": 2},
    {"text": "야간경관 계획을 수립하였는가"}
  ]`;

  const items = parseExtractedItems(raw, { fileName: FILE_NAME, page: 2 });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, "c1");
  assert.equal(items[0]?.category, "배치");
  assert.equal(items[1]?.source?.fileName, FILE_NAME);
});

test("normalizeChecklistStatus는 변형 표기를 4단계로 정규화한다", () => {
  assert.equal(normalizeChecklistStatus("충족"), "충족");
  assert.equal(normalizeChecklistStatus("일부 반영"), "부분충족");
  assert.equal(normalizeChecklistStatus("미반영"), "미충족");
  assert.equal(normalizeChecklistStatus("판단 불가"), "확인불가");
});

test("sanitizeFindings는 근거 페이지·법령 인용을 검증한다", () => {
  const file = buildFile(["개요", "체크리스트\n□ 항목", "배치도"]);
  const items = [
    { id: "c1", text: "주변 가로와의 연속성을 확보하였는가" },
    { id: "c2", text: "야간경관 계획을 수립하였는가" },
  ];

  const findings = sanitizeFindings(
    [
      {
        itemId: "c1",
        status: "충족",
        rationale: "배치도에서 확인",
        evidence: [
          { fileName: FILE_NAME, page: 3, note: "배치도에 가로 연결 표기" },
          { fileName: FILE_NAME, page: 99, note: "존재하지 않는 페이지" },
        ],
        lawRefs: [{ title: "경관법", article: "제28조" }, { title: "존재하지않는법" }],
      },
      // c2 누락 → 확인불가 처리
    ],
    items,
    buildContext(),
    [file],
  );

  assert.equal(findings.length, 2);
  const first = findings.find((finding) => finding.itemId === "c1");
  assert.equal(first?.status, "충족");
  assert.equal(first?.evidence.length, 1);
  assert.equal(first?.evidence[0]?.page, 3);
  assert.equal(first?.lawRefs.length, 1);
  assert.equal(first?.lawRefs[0]?.title, "경관법");
  assert.ok(first?.lawRefs[0]?.sourceUrl);

  const second = findings.find((finding) => finding.itemId === "c2");
  assert.equal(second?.status, "확인불가");
});

test("sanitizeFindings는 근거 없는 충족 판정을 확인불가로 강등한다", () => {
  const file = buildFile(["개요"]);
  const findings = sanitizeFindings(
    [{ itemId: "c1", status: "충족", rationale: "그냥 충족", evidence: [], lawRefs: [] }],
    [{ id: "c1", text: "항목" }],
    buildContext(),
    [file],
  );

  assert.equal(findings[0]?.status, "확인불가");
});

test("countFindingStatuses는 상태별 개수를 집계한다", () => {
  const counts = countFindingStatuses([
    { itemId: "c1", status: "충족", rationale: "", evidence: [], lawRefs: [] },
    { itemId: "c2", status: "미충족", rationale: "", evidence: [], lawRefs: [] },
    { itemId: "c3", status: "미충족", rationale: "", evidence: [], lawRefs: [] },
  ]);

  assert.equal(counts.충족, 1);
  assert.equal(counts.미충족, 2);
  assert.equal(counts.부분충족, 0);
  assert.equal(counts.확인불가, 0);
});

test("salvageTruncatedPayload는 잘린 JSON에서 완성된 판정을 복구한다", async () => {
  const { salvageTruncatedPayload } = await import("../lib/checklist-review/evaluate-items");
  const truncated = `{"summary":"전반적으로 양호합니다.","findings":[
    {"itemId":"c1","status":"충족","rationale":"근거 확인","evidence":[{"fileName":"a.pdf","page":2,"note":"배치도"}],"lawRefs":[]},
    {"itemId":"c2","status":"미충족","rationale":"근거 없음","evidence":[],"lawRefs":[]},
    {"itemId":"c3","status":"부분충족","rationale":"잘린 항`;

  const payload = salvageTruncatedPayload(truncated);
  assert.ok(payload);
  assert.equal(payload?.findings?.length, 2);
  assert.equal(payload?.findings?.[0]?.itemId, "c1");
  assert.equal(payload?.summary, "전반적으로 양호합니다.");
});
