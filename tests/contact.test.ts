import assert from "node:assert/strict";
import test from "node:test";
import { validateContact } from "../lib/contact";

test("담당자 연락처·이메일 — 비어 있으면 통과, 형식이 틀리면 안내", () => {
  assert.equal(validateContact("", ""), "");
  assert.equal(validateContact("010-1234-5678", "name@example.com"), "");
  assert.equal(validateContact("02 123 4567", ""), "");
  assert.equal(validateContact("01012345678", ""), "");
  assert.notEqual(validateContact("1234", ""), "");
  assert.notEqual(validateContact("010-1234-567a", ""), "");
  assert.notEqual(validateContact("", "name@example"), "");
  assert.notEqual(validateContact("", "name example.com"), "");
});
