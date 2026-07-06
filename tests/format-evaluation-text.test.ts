import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineAiEvaluationText,
  formatEvaluationText,
  renumberEvaluationText,
} from "../lib/format-evaluation-text";

test("renumberEvaluationText merges duplicate list starts into one sequence", () => {
  const input = [
    "1. 「심의도서.pdf」 p.2 관련 기재는 있으나,",
    "1. 「심의도서.pdf」 배치도 — 평가기준 미달",
    "2. 스카이라인 연속성 불명확",
    "1. 옥외 매스 분절 미흡",
    "2. 주변 건축물과 스케일 조정 필요",
  ].join("\n");

  const output = renumberEvaluationText(input);
  assert.match(output, /^「심의도서\.pdf」 p\.2 관련 기재는 있으나,/m);
  assert.match(output, /^1\. 「심의도서\.pdf」 배치도 — 평가기준 미달/m);
  assert.match(output, /^2\. 스카이라인 연속성 불명확/m);
  assert.match(output, /^3\. 옥외 매스 분절 미흡/m);
  assert.match(output, /^4\. 주변 건축물과 스케일 조정 필요/m);
  assert.doesNotMatch(output, /^1\. 옥외 매스/m);
});

test("combineAiEvaluationText continues numbering across rationale and recommendation", () => {
  const rationale = [
    "「심의도서.pdf」 p.12에서 관련 기재는 있으나,",
    "1. 배치도 — 스케일 미달",
    "2. 스카이라인 불명확",
  ].join("\n");

  const recommendation = [
    "「심의도서.pdf」 p.31 관련:",
    "1. 색채계획 수치 보완",
    "2. 체크리스트 대조표 추가",
  ].join("\n");

  const output = combineAiEvaluationText(rationale, recommendation);
  assert.match(output, /^1\. 배치도 — 스케일 미달/m);
  assert.match(output, /^2\. 스카이라인 불명확/m);
  assert.match(output, /^3\. 색채계획 수치 보완/m);
  assert.match(output, /^4\. 체크리스트 대조표 추가/m);
});

test("formatEvaluationText renumbers after inline list breaks", () => {
  const input =
    "다음 평가 근거: 1. 첫 번째 항목 2. 두 번째 항목 3. 세 번째 항목";
  const output = formatEvaluationText(input);
  assert.equal(output, "다음 평가 근거:\n\n1. 첫 번째 항목\n2. 두 번째 항목\n3. 세 번째 항목");
});
