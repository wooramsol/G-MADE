import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareEvaluationDisplay, structureEvaluationDisplay } from "../lib/evaluation-display";

const longFile = "심의도서(금곡2리 경로당(마을회관) 증축공사).pdf";

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

  assert.equal(display.points.length, 4);
  assert.equal(display.points[0]!.content, "옥외 관련 수정·재확인 필요");
  assert.equal(display.points[0]!.evidence, "p.2");
  assert.match(display.points[1]!.content, /수치·재료 미기재/);
  assert.equal(display.points[1]!.evidence, "p.12 배치도");
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

test("prepareEvaluationDisplay attaches law links to points", () => {
  const display = prepareEvaluationDisplay(
    "1. p.12 배치도 — 수치 미기재 — 경관의 법률 제28조 관련 저촉",
    "",
    {
      lawLinks: [
        {
          title: "경관의 법률",
          subtitle: "제28조",
          href: "https://example.com/law",
        },
      ],
      guidelineLinks: [],
    },
  );

  assert.equal(display.points.length, 1);
  assert.equal(display.points[0]!.references.length, 1);
  assert.equal(display.points[0]!.references[0]!.href, "https://example.com/law");
});
