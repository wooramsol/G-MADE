import assert from "node:assert/strict";
import { test } from "node:test";
import type { UploadedFileSummary } from "../lib/ai/analysis-types";
import { evaluationItems } from "../lib/demo-data";
import { prepareEvaluationDisplay, structureEvaluationDisplay } from "../lib/evaluation-display";

const longFile = "심의도서(금곡2리 경로당(마을회관) 증축공사).pdf";

function makeStoredFiles(): UploadedFileSummary[] {
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
    "주차장 배치 및 보행 동선",
  ].join("\n");

  return [
    {
      id: "file-1",
      originalName: "심의도서.pdf",
      fileType: "application/pdf",
      sizeBytes: corpus.length,
      storagePath: "",
      extractedTextPreview: corpus,
      totalPages: 20,
    },
  ];
}

test("structureEvaluationDisplay corrects bogus p.2 배치도 evidence when files provided", () => {
  const fullInput = [
    `1. p.2 배치도 — 평가기준 대비 수치·재료 미기재`,
    `2. p.2 — 주변 스카이라인과 과도한 단절 없...`,
    `3. p.2 — 스케일 조정 근거 불명확`,
  ].join("\n");

  const display = structureEvaluationDisplay(fullInput, makeStoredFiles());

  assert.equal(display.points[0]!.evidence, "p.12 배치도");
  assert.equal(display.points[1]!.evidence, "p.12 배치도");
});

test("structureEvaluationDisplay filters broken law clause fragments", () => {
  const input = [
    "1. p.14 배치도 — 평가기준 대비 수치·재료 미기재",
    "2. 관련 내용 — 인공조명에 의한 빛공해 방지법 제11조 적용·저촉 검토 필요",
    "3. 관련 내용 — 인공조명에 의한",
  ].join("\n");

  const display = structureEvaluationDisplay(input);

  assert.equal(display.points.length, 1);
  assert.match(display.points[0]!.content, /수치·재료 미기재/);
});

test("structureEvaluationDisplay builds point list with evidence under content", () => {
  const input = [
    `「${longFile}」 p.12 배치도·경관체크리스트 검토.`,
    "다음 평가 근거가 확인됨:",
    `1. 「${longFile}」 p.2 — 옥외 관련 수정·재확인 필요`,
    `2. 「${longFile}」 p.12 배치도 — 평가기준 대비 수치·재료 미기재`,
    `3. 「${longFile}」 p.12 배치도 — 스카이라인 연속성 불명확`,
    `4. 「${longFile}」 p.12 배치도 — 스카이라인 연속성이 도면에서 확인되지 않음`,
    `5. 관련 내용 — 경관법 시행령 제14조 적용·저촉 검토 필요`,
  ].join("\n");

  const display = structureEvaluationDisplay(input);

  assert.equal(display.points.length, 3);
  assert.equal(display.points[0]!.content, "옥외 관련 수정·재확인 필요");
  assert.equal(display.points[0]!.evidence, "p.2");
  assert.match(display.points[1]!.content, /수치·재료 미기재/);
  assert.equal(display.points[1]!.evidence, "p.12 배치도");
});

test("structureEvaluationDisplay filters broken quote placeholders", () => {
  const input = [
    `1. "..." 등 확인.`,
    `2. "..." 등을 검토한 결과, 옥외 관련하여 다음 사항의 수정·보완·재확인이 필요합니다.`,
    "3. p.12 배치도 — 스카이라인 연속성 불명확",
  ].join("\n");

  const display = structureEvaluationDisplay(input);

  assert.equal(display.points.length, 1);
  assert.match(display.points[0]!.content, /스카이라인/);
});

test("structureEvaluationDisplay resolves evidence per evaluation item topic", () => {
  const corpus = [
    "--- 「심의도서.pdf」 p.14 ---",
    "배치도",
    "주차장 배치",
    "보행 동선 및 진입로",
    "",
    "--- 「심의도서.pdf」 p.18 ---",
    "야간경관",
    "조도 25lux",
    "",
    "--- 「심의도서.pdf」 p.20 ---",
    "색채계획",
    "주조색",
  ].join("\n");

  const files: UploadedFileSummary[] = [
    {
      id: "file-1",
      originalName: "심의도서.pdf",
      fileType: "application/pdf",
      sizeBytes: corpus.length,
      storagePath: "",
      extractedTextPreview: corpus,
      totalPages: 25,
    },
  ];

  const walkItem = evaluationItems.find((item) => item.id === "item-walk")!;
  const nightItem = evaluationItems.find((item) => item.id === "item-nightscape")!;
  const colorItem = evaluationItems.find((item) => item.id === "item-color")!;

  const walkDisplay = structureEvaluationDisplay("1. p.14 배치도 — 보행 동선 미기재", files, walkItem);
  const nightDisplay = structureEvaluationDisplay("1. p.14 — 야간 조명 기준 불명확", files, nightItem);
  const colorDisplay = structureEvaluationDisplay("1. p.14 — 주조색 팔레트 누락", files, colorItem);

  assert.match(walkDisplay.points[0]!.evidence, /p\.14.*배치도/);
  assert.match(nightDisplay.points[0]!.evidence, /p\.18.*야간/);
  assert.match(colorDisplay.points[0]!.evidence, /p\.20.*색채/);
});

test("prepareEvaluationDisplay merges rationale and recommendation into one list", () => {
  const rationale = [
    "「심의도서.pdf」 p.25 주차·보행 동선도 검토.",
    "1. p.25 — 장애인 주차 위치 미표기",
    "2. p.12 — 스케일 조정 근거 불명확",
  ].join("\n");

  const recommendation = [
    "1. p.25 주차 동선도에 장애인 주차 위치·규격을 표기하시기 바랍니다.",
    "2. p.12 배치도에 주변 건축물 스케일 비교를 추가하시기 바랍니다.",
  ].join("\n");

  const display = prepareEvaluationDisplay(rationale, recommendation);

  assert.equal(display.points.length, 4);
  assert.match(display.points[2]!.content, /하시기 바랍니다/);
  assert.equal(display.points[2]!.evidence, "p.25 동선도");
});
