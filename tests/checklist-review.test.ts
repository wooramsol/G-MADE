import assert from "node:assert/strict";
import test from "node:test";
import { buildPdfPageMarkedText } from "../lib/ai/page-citation";
import type { UploadedFileSummary } from "../lib/ai/uploaded-file";
import { sanitizeFindings } from "../lib/checklist-review/evaluate-items";
import { parseExtractedItems } from "../lib/checklist-review/extract-items";
import { findChecklistPages } from "../lib/checklist-review/find-checklist-pages";
import { countFindingStatuses, normalizeChecklistStatus } from "../lib/checklist-review/types";
import {
  addUsage,
  estimateUsageSummary,
  formatUsageLabel,
  mergeUsageByModel,
  type UsageByModel,
} from "../lib/checklist-review/usage-cost";
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

// ── selectClaudeVisionFiles: 파일 단위 비전 선별 ──
test("selectClaudeVisionFiles는 한도 내 파일만 포함하고 초과 파일은 사유와 함께 제외한다", async () => {
  const { selectClaudeVisionFiles, CLAUDE_PDF_VISION_MAX_BYTES } = await import("../lib/ai/anthropic-request");

  const smallBase64 = "A".repeat(4 * 1024 * 1024); // ≈3MB
  const hugeBase64 = "A".repeat(Math.ceil((CLAUDE_PDF_VISION_MAX_BYTES * 4) / 3) + 8); // 한도 초과

  const files: UploadedFileSummary[] = [
    {
      id: "f1",
      originalName: "도면.pdf",
      totalPages: 30,
      visionAssets: [{ label: "도면.pdf", mediaType: "application/pdf", base64: smallBase64 }],
    },
    {
      id: "f2",
      originalName: "대용량.pdf",
      totalPages: 50,
      visionAssets: [{ label: "대용량.pdf", mediaType: "application/pdf", base64: hugeBase64 }],
    },
    {
      id: "f3",
      originalName: "사진.png",
      visionAssets: [{ label: "사진.png", mediaType: "image/png", base64: smallBase64 }],
    },
  ];

  const selection = selectClaudeVisionFiles(files);
  assert.equal(selection.includedKeys.has("f1"), true);
  assert.equal(selection.includedKeys.has("f2"), false);
  assert.equal(selection.includedKeys.has("f3"), true);
  assert.equal(selection.excluded.length, 1);
  assert.match(selection.excluded[0].fileName, /대용량/);
});

test("selectClaudeVisionFiles는 100페이지 초과 PDF를 제외한다", async () => {
  const { selectClaudeVisionFiles } = await import("../lib/ai/anthropic-request");

  const files: UploadedFileSummary[] = [
    {
      id: "long",
      originalName: "긴문서.pdf",
      totalPages: 140,
      visionAssets: [{ label: "긴문서.pdf", mediaType: "application/pdf", base64: "AAAA" }],
    },
  ];

  const selection = selectClaudeVisionFiles(files);
  assert.equal(selection.includedKeys.size, 0);
  assert.equal(selection.excluded.length, 1);
  assert.match(selection.excluded[0].reason, /100페이지/);
});

// ── 대용량 PDF 분할·병합 파이프라인 ──
test("splitPdfIntoChunks는 페이지 한도로 연속 구간을 만들고 원본 페이지 번호를 보존한다", async () => {
  const { splitPdfIntoChunks } = await import("../lib/pdf/split-pdf");
  const { PDFDocument } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  for (let index = 0; index < 7; index += 1) {
    doc.addPage([200, 200]);
  }
  const base64 = Buffer.from(await doc.save()).toString("base64");

  const chunks = await splitPdfIntoChunks(base64, { maxBytesPerChunk: 10 * 1024 * 1024, maxPagesPerChunk: 3 });

  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((chunk) => [chunk.startPage, chunk.endPage]),
    [
      [1, 3],
      [4, 6],
      [7, 7],
    ],
  );

  // 각 구간이 유효한 PDF인지 확인
  const first = await PDFDocument.load(Buffer.from(chunks[0].base64, "base64"));
  assert.equal(first.getPageCount(), 3);
});

test("mergeGroupFindings는 구간별 판정을 충족 우선으로 병합한다", async () => {
  const { mergeGroupFindings } = await import("../lib/checklist-review/evaluate-items");

  const items = [
    { id: "c1", text: "가로변 차폐 조경 계획 반영" },
    { id: "c2", text: "야간 경관 조명 계획 수립" },
  ];

  const groupA = [
    { itemId: "c1", status: "확인불가" as const, rationale: "이 구간에서 근거 없음", evidence: [], lawRefs: [] },
    {
      itemId: "c2",
      status: "미충족" as const,
      rationale: "조명 계획 미확인",
      evidence: [{ fileName: "심의도서.pdf", page: 3, note: "조명 언급 없음" }],
      lawRefs: [],
    },
  ];
  const groupB = [
    {
      itemId: "c1",
      status: "충족" as const,
      rationale: "배치도에서 차폐 조경 확인",
      evidence: [{ fileName: "심의도서.pdf", page: 41, note: "차폐 조경 표기" }],
      lawRefs: [],
    },
    { itemId: "c2", status: "확인불가" as const, rationale: "이 구간에서 근거 없음", evidence: [], lawRefs: [] },
  ];

  const merged = mergeGroupFindings([groupA, groupB], items);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].itemId, "c1");
  assert.equal(merged[0].status, "충족");
  assert.equal(merged[0].evidence[0].page, 41);
  assert.equal(merged[1].itemId, "c2");
  assert.equal(merged[1].status, "미충족");
});

test("mergeExtractedItems는 구간 간 중복 항목을 제거하고 id를 재부여한다", async () => {
  const { mergeExtractedItems } = await import("../lib/checklist-review/evaluate-items");

  const merged = mergeExtractedItems([
    [
      { id: "c1", text: "스카이라인을 고려한 높이 계획" },
      { id: "c2", text: "옥탑 구조물 차폐 계획" },
    ],
    [
      { id: "c1", text: "스카이라인을  고려한 높이 계획" }, // 공백 차이만 있는 중복
      { id: "c2", text: "저층부 입면 분절 계획" },
    ],
  ]);

  assert.deepEqual(
    merged.map((item) => [item.id, item.text.replace(/\s+/g, " ")]),
    [
      ["c1", "스카이라인을 고려한 높이 계획"],
      ["c2", "옥탑 구조물 차폐 계획"],
      ["c3", "저층부 입면 분절 계획"],
    ],
  );
});

// ── 심의 매뉴얼 발췌 ──
test("selectManualExcerpts는 항목 키워드와 관련된 매뉴얼 페이지를 상한 내에서 반환한다", async () => {
  const { selectManualExcerpts, buildManualContextText } = await import("../lib/manual/reference-manual");

  const excerpts = selectManualExcerpts(["건축물 외벽 색채 계획", "야간 경관 조명"]);
  assert.ok(excerpts.length > 0, "색채·조명 관련 페이지가 최소 1개 이상 선택되어야 함");
  assert.ok(excerpts.length <= 10);
  assert.ok(excerpts.every((entry) => entry.page >= 1 && entry.text.length > 0));

  const contextText = buildManualContextText(["색채 계획"]);
  assert.match(contextText, /\[심의 매뉴얼 발췌/);
  assert.match(contextText, /매뉴얼 p\.\d+/);

  // 무의미한 질의는 빈 결과
  assert.equal(buildManualContextText([""]), "");
});


// ── 페이지 관련도 필터링 ──
test("extractPdfPages는 지정한 비연속 페이지만 담은 새 PDF를 만들고 매핑을 반환한다", async () => {
  const { extractPdfPages } = await import("../lib/pdf/split-pdf");
  const { PDFDocument } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  for (let index = 0; index < 10; index += 1) {
    doc.addPage([200, 200]);
  }
  const base64 = Buffer.from(await doc.save()).toString("base64");

  const extracted = await extractPdfPages(base64, [7, 2, 2, 9]);
  assert.ok(extracted);
  assert.deepEqual(extracted?.pages, [2, 7, 9]);

  const rebuilt = await PDFDocument.load(Buffer.from(extracted!.base64, "base64"));
  assert.equal(rebuilt.getPageCount(), 3);

  const empty = await extractPdfPages(base64, [999, -1]);
  assert.equal(empty, null);
});

test("selectRelevantPagesForBatch는 텍스트 레이어 없는 파일을 skippedFiles로 폴백 표시한다", async () => {
  const { selectRelevantPagesForBatch } = await import("../lib/checklist-review/relevant-pages");

  const scannedFile: UploadedFileSummary = {
    originalName: "스캔본.pdf",
    extractedTextPreview: "",
    totalPages: 40,
  };

  const { pagesByFile, skippedFiles } = selectRelevantPagesForBatch(
    [scannedFile],
    [{ id: "c1", text: "야간 경관 조명 계획 수립 여부" }],
  );

  assert.ok(skippedFiles.has("스캔본.pdf"));
  assert.equal(pagesByFile.has("스캔본.pdf"), false);
});

test("selectRelevantPagesForBatch는 항목 키워드와 일치하는 페이지를 선별하고 작은 문서는 건너뛴다", async () => {
  const { selectRelevantPagesForBatch } = await import("../lib/checklist-review/relevant-pages");
  const { buildPdfPageMarkedText } = await import("../lib/ai/page-citation");

  const pageTexts = Array.from({ length: 30 }, (_, index) => {
    if (index === 4) return "야간 경관 조명 계획 배치도 색채 검토 결과 요약 설명 본문";
    if (index === 17) return "보행 동선 장애인 보행약자 접근성 배치 계획 검토 결과 요약";
    return `기타 일반 본문 페이지 ${index + 1} 관련 없는 내용 설명 서술`;
  });

  const bigFile: UploadedFileSummary = {
    originalName: "대형문서.pdf",
    extractedTextPreview: buildPdfPageMarkedText("대형문서.pdf", pageTexts),
    totalPages: pageTexts.length,
  };

  const { pagesByFile, skippedFiles } = selectRelevantPagesForBatch(
    [bigFile],
    [{ id: "c1", text: "야간 경관 조명 계획이 배치도에 반영되어 있는가" }],
  );

  assert.ok(!skippedFiles.has("대형문서.pdf"));
  const pages = pagesByFile.get("대형문서.pdf") ?? [];
  assert.ok(pages.includes(5), `p.5가 선별되어야 함 (실제: ${pages.join(",")})`);
  assert.ok(pages.length < pageTexts.length, "전체 페이지보다는 적게 선별되어야 함");

  // 페이지 수가 적은(20p 이하) 문서는 필터링 이득이 적어 항상 skip
  const smallFile: UploadedFileSummary = {
    originalName: "소형문서.pdf",
    extractedTextPreview: buildPdfPageMarkedText("소형문서.pdf", pageTexts.slice(0, 10)),
    totalPages: 10,
  };
  const smallResult = selectRelevantPagesForBatch([smallFile], [{ id: "c1", text: "야간 경관 조명 계획" }]);
  assert.ok(smallResult.skippedFiles.has("소형문서.pdf"));
});

// ── 동일 문서 재분석 감지(캐시) ──
test("computeFilesFingerprint는 파일 내용이 완전히 같을 때만 동일한 지문을 반환한다", async () => {
  const { computeFilesFingerprint, hashFileBuffer } = await import("../lib/checklist-review/file-fingerprint");

  const hashA = hashFileBuffer(Buffer.from("문서 내용 A"));
  const hashB = hashFileBuffer(Buffer.from("문서 내용 B"));

  const filesV1 = [{ originalName: "심의도서.pdf", contentHash: hashA }];
  const filesV1Again = [{ originalName: "심의도서.pdf", contentHash: hashA }];
  const filesV2 = [{ originalName: "심의도서.pdf", contentHash: hashB }];

  assert.equal(computeFilesFingerprint(filesV1), computeFilesFingerprint(filesV1Again));
  assert.notEqual(computeFilesFingerprint(filesV1), computeFilesFingerprint(filesV2));

  // 파일 순서가 달라도(정렬 후 비교) 같은 집합이면 동일 지문
  const twoFilesOrderA = [
    { originalName: "a.pdf", contentHash: hashA },
    { originalName: "b.pdf", contentHash: hashB },
  ];
  const twoFilesOrderB = [
    { originalName: "b.pdf", contentHash: hashB },
    { originalName: "a.pdf", contentHash: hashA },
  ];
  assert.equal(computeFilesFingerprint(twoFilesOrderA), computeFilesFingerprint(twoFilesOrderB));

  // 해시 없는 파일이 섞여 있으면(예: 이 기능 도입 이전 기록) 비교 불가로 null
  assert.equal(computeFilesFingerprint([{ originalName: "옛날파일.pdf" }]), null);
  assert.equal(computeFilesFingerprint([]), null);

  // 파일 개수가 다르면 다른 지문
  assert.notEqual(computeFilesFingerprint(filesV1), computeFilesFingerprint(twoFilesOrderA));
});

// ── 부분 변경(페이지 단위) 재분석 감지 ──
test("hashPdfPages는 페이지 내용이 바뀌면 해당 페이지의 해시만 달라진다", async () => {
  const { hashPdfPages } = await import("../lib/pdf/split-pdf");
  const { PDFDocument, rgb } = await import("pdf-lib");

  const buildDoc = async (secondPageMarked: boolean) => {
    const doc = await PDFDocument.create();
    for (let index = 0; index < 3; index += 1) {
      const page = doc.addPage([200, 200]);
      if (index === 1 && secondPageMarked) {
        page.drawRectangle({ x: 20, y: 100, width: 50, height: 30, color: rgb(0, 0, 0) });
      }
    }
    return Buffer.from(await doc.save()).toString("base64");
  };

  const original = await hashPdfPages(await buildDoc(false));
  const modified = await hashPdfPages(await buildDoc(true));

  assert.ok(original && modified);
  assert.equal(original!.length, 3);
  assert.equal(modified!.length, 3);
  assert.equal(original![0], modified![0], "1페이지는 안 바뀌었으니 해시도 같아야 함");
  assert.notEqual(original![1], modified![1], "2페이지 내용이 바뀌었으니 해시도 달라야 함");
  assert.equal(original![2], modified![2], "3페이지는 안 바뀌었으니 해시도 같아야 함");
});

test("computeFileAlignments는 내용 해시가 같은 파일을 identical로, 새 파일을 unavailable로 처리한다", async () => {
  const { computeFileAlignments } = await import("../lib/checklist-review/partial-reuse");

  const alignments = computeFileAlignments(
    [
      { originalName: "a.pdf", contentHash: "same" },
      { originalName: "b.pdf", contentHash: "hashB2", pageHashes: ["p1", "p2x", "p3"] },
      { originalName: "d.pdf", contentHash: "hashD" },
    ],
    [
      { originalName: "a.pdf", contentHash: "same" },
      { originalName: "b.pdf", contentHash: "hashB1", pageHashes: ["p1", "p2", "p3"] },
    ],
  );

  assert.deepEqual(alignments.get("a.pdf"), { kind: "identical" });
  assert.deepEqual(alignments.get("b.pdf"), { kind: "aligned", baselineToCurrent: new Map([[1, 1], [3, 3]]) });
  assert.deepEqual(alignments.get("d.pdf"), { kind: "unavailable" });
});

test("alignPagesByContent는 페이지가 삽입·삭제돼 번호가 밀려도 내용으로 올바르게 대응시킨다", async () => {
  const { alignPagesByContent } = await import("../lib/checklist-review/partial-reuse");

  // 기준: p1 p2 p3 p4 p5 / 현재: p1 [새페이지] p2 p3 [p4 삭제됨] p5
  const baseline = ["h1", "h2", "h3", "h4", "h5"];
  const current = ["h1", "hNEW", "h2", "h3", "h5"];

  const mapping = alignPagesByContent(baseline, current);

  assert.equal(mapping.get(1), 1, "기준 p1 -> 현재 p1");
  assert.equal(mapping.get(2), 3, "기준 p2 -> 현재 p3 (앞에 새 페이지가 끼어들어 한 칸 밀림)");
  assert.equal(mapping.get(3), 4, "기준 p3 -> 현재 p4");
  assert.equal(mapping.has(4), false, "기준 p4는 삭제되어 대응 없음");
  assert.equal(mapping.get(5), 5, "기준 p5 -> 현재 p5 (삭제된 p4만큼 다시 앞으로 당겨짐)");
});

test("partitionItemsForReuse는 페이지가 밀려도 근거를 재사용하며 페이지 번호를 현재 문서 기준으로 재매핑한다", async () => {
  const { computeFileAlignments, buildFindingsByText, partitionItemsForReuse } = await import(
    "../lib/checklist-review/partial-reuse"
  );

  const baselineItems = [
    { id: "c1", text: "가로변 차폐 조경 계획 반영" },
    { id: "c2", text: "야간 경관 조명 계획 수립" },
    { id: "c3", text: "장애인 보행약자 접근로 확보" },
  ];
  const baselineFindings = [
    {
      itemId: "c1",
      status: "충족" as const,
      rationale: "배치도에서 확인",
      evidence: [{ fileName: "심의도서.pdf", page: 5, note: "차폐 조경 표기" }],
      lawRefs: [],
    },
    {
      itemId: "c2",
      status: "미충족" as const,
      rationale: "조명 계획 미확인",
      evidence: [{ fileName: "심의도서.pdf", page: 3, note: "조명 계획 없음" }],
      lawRefs: [],
    },
    { itemId: "c3", status: "확인불가" as const, rationale: "근거 없음", evidence: [], lawRefs: [] },
  ];

  // 2페이지 앞에 새 표지 페이지가 하나 삽입됨: 기준 p3(c2 근거) -> 현재 p4, 기준 p5(c1 근거) -> 현재 p6
  const alignments = computeFileAlignments(
    [
      {
        originalName: "심의도서.pdf",
        contentHash: "v2",
        pageHashes: ["h1", "hNEW", "h2", "h3", "h4", "h5"],
      },
    ],
    [
      {
        originalName: "심의도서.pdf",
        contentHash: "v1",
        pageHashes: ["h1", "h2", "h3", "h4", "h5"],
      },
    ],
  );

  const findingsByText = buildFindingsByText(baselineItems, baselineFindings);
  const currentItems = [...baselineItems]; // 문구는 그대로, 표지 한 장만 추가된 상황
  const { reused, needEval } = partitionItemsForReuse(currentItems, findingsByText, alignments);

  // c1(근거 기준 p.5)은 삽입 이후 페이지라 현재 p.6으로 재매핑되어 재사용.
  // c2(근거 기준 p.3)도 현재 p.4로 재매핑되어 재사용.
  // c3는 근거 자체가 없는 판정이라 항상 재분석.
  assert.ok(reused.has("c1"));
  assert.equal(reused.get("c1")?.evidence[0]?.page, 6, "삽입된 페이지만큼 밀려 p.6으로 재매핑되어야 함");
  assert.ok(reused.has("c2"));
  assert.equal(reused.get("c2")?.evidence[0]?.page, 4, "삽입된 페이지만큼 밀려 p.4로 재매핑되어야 함");
  assert.ok(needEval.some((item) => item.id === "c3"));
  assert.equal(reused.size + needEval.length, currentItems.length);
});

test("addUsage: 같은 모델의 여러 호출 사용량을 누적한다", () => {
  const usageByModel: UsageByModel = new Map();
  addUsage(usageByModel, "claude-sonnet-4-6", {
    inputTokens: 1000,
    outputTokens: 200,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });
  addUsage(usageByModel, "claude-sonnet-4-6", {
    inputTokens: 500,
    outputTokens: 100,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });
  addUsage(usageByModel, "claude-sonnet-4-6", undefined);

  const usage = usageByModel.get("claude-sonnet-4-6");
  assert.equal(usage?.inputTokens, 1500);
  assert.equal(usage?.outputTokens, 300);
});

test("mergeUsageByModel: 다른 맵의 사용량을 모델별로 합산한다", () => {
  const target: UsageByModel = new Map();
  addUsage(target, "claude-sonnet-4-6", {
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });

  const source: UsageByModel = new Map();
  addUsage(source, "claude-sonnet-4-6", {
    inputTokens: 200,
    outputTokens: 30,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });
  addUsage(source, "claude-haiku-4-5", {
    inputTokens: 40,
    outputTokens: 10,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });

  mergeUsageByModel(target, source);

  assert.equal(target.get("claude-sonnet-4-6")?.inputTokens, 300);
  assert.equal(target.get("claude-sonnet-4-6")?.outputTokens, 80);
  assert.equal(target.get("claude-haiku-4-5")?.inputTokens, 40);
});

test("estimateUsageSummary: sonnet 단가($3/$15/1M)로 비용을 추정한다", () => {
  const usageByModel: UsageByModel = new Map();
  addUsage(usageByModel, "claude-sonnet-4-6", {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });

  const summary = estimateUsageSummary(usageByModel);
  assert.equal(summary.totalTokens, 2_000_000);
  // 1M input * $3/M + 1M output * $15/M = $18
  assert.ok(Math.abs(summary.costUsd - 18) < 1e-9, `expected ~18, got ${summary.costUsd}`);
});

test("estimateUsageSummary: haiku 단가($1/$5/1M)와 캐시 배수를 반영한다", () => {
  const usageByModel: UsageByModel = new Map();
  addUsage(usageByModel, "claude-haiku-4-5", {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 1_000_000,
    cacheReadInputTokens: 1_000_000,
  });

  const summary = estimateUsageSummary(usageByModel);
  // cache write 1M * $1.25/M + cache read 1M * $0.10/M = $1.35
  assert.ok(Math.abs(summary.costUsd - 1.35) < 1e-9, `expected ~1.35, got ${summary.costUsd}`);
});

test("estimateUsageSummary: sonnet·haiku를 섞어 쓰면 모델별 단가를 각각 적용해 합산한다", () => {
  const usageByModel: UsageByModel = new Map();
  addUsage(usageByModel, "claude-sonnet-4-6", {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });
  addUsage(usageByModel, "claude-haiku-4-5", {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });

  const summary = estimateUsageSummary(usageByModel);
  assert.equal(summary.totalTokens, 2_000_000);
  // sonnet 1M input * $3/M + haiku 1M input * $1/M = $4
  assert.ok(Math.abs(summary.costUsd - 4) < 1e-9, `expected ~4, got ${summary.costUsd}`);
});

test("formatUsageLabel: 999k9.99 형식으로 천 단위 토큰·달러(소수 2자리)를 표기한다", () => {
  assert.equal(formatUsageLabel({ totalTokens: 999_000, costUsd: 9.99 }), "999k9.99");
  assert.equal(formatUsageLabel({ totalTokens: 0, costUsd: 0 }), "0k0.00");
  assert.equal(formatUsageLabel({ totalTokens: 1_499, costUsd: 0.004 }), "1k0.00");
});
