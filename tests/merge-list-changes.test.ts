import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeListChanges } from "../lib/merge-list";

const key = (value: string) => value;

test("동시에 다른 사람이 추가한 항목은 유지하고 내 변경만 반영", () => {
  // 나: [A,B]를 보고 C 추가 / 그 사이 다른 사람이 D 추가해 저장본은 [A,B,D]
  assert.deepEqual(mergeListChanges(["A", "B", "D"], ["A", "B"], ["A", "B", "C"], key), ["A", "B", "D", "C"]);
});

test("내가 지운 항목만 지우고 다른 사람이 추가한 항목은 남김", () => {
  assert.deepEqual(mergeListChanges(["A", "B", "D"], ["A", "B"], ["A"], key), ["A", "D"]);
});

test("다른 사람이 이미 지운 항목을 내가 되살리지 않음", () => {
  // 저장본에서 B가 지워졌는데 내 화면은 [A,B]를 보고 C 추가
  assert.deepEqual(mergeListChanges(["A"], ["A", "B"], ["A", "B", "C"], key), ["A", "C"]);
});

test("내가 안 건드린 항목은 다른 사람이 바꾼 현재값 유지", () => {
  type R = { id: string; name: string };
  const keyOf = (r: R) => r.id;
  const base: R[] = [{ id: "1", name: "갑" }];
  const current: R[] = [{ id: "1", name: "갑(수정)" }];
  const next: R[] = [{ id: "1", name: "갑" }, { id: "2", name: "을" }];
  assert.deepEqual(mergeListChanges(current, base, next, keyOf), [{ id: "1", name: "갑(수정)" }, { id: "2", name: "을" }]);
});
