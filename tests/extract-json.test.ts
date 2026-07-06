import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJsonContent } from "../lib/ai/extract-json";

test("returns plain JSON as-is", () => {
  assert.equal(extractJsonContent('{"a":1}'), '{"a":1}');
});

test("extracts JSON from fenced code block", () => {
  const content = '```json\n{"a":1}\n```';
  assert.equal(extractJsonContent(content), '{"a":1}');
});

test("extracts JSON from fenced block without language tag", () => {
  const content = '```\n{"a":1}\n```';
  assert.equal(extractJsonContent(content), '{"a":1}');
});

test("extracts JSON wrapped in prose", () => {
  const content = '분석 결과는 다음과 같습니다.\n{"summary":"요약","items":[1,2]}\n검토 바랍니다.';
  assert.equal(extractJsonContent(content), '{"summary":"요약","items":[1,2]}');
});

test("handles undefined and empty input", () => {
  assert.equal(extractJsonContent(undefined), undefined);
  assert.equal(extractJsonContent(""), undefined);
});

test("returns trimmed content when no JSON braces found", () => {
  assert.equal(extractJsonContent("  no json here  "), "no json here");
});
