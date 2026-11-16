import assert from "node:assert/strict";
import test from "node:test";
import { cleanChecklistLabel } from "../lib/checklist-review/clean-label";
import { buildEvidenceAnchors, isTitleLikeAnchor } from "../lib/checklist-review/evidence-anchors";

test("제목처럼 보이는 인용구는 근거 표시에서 제외", () => {
  for (const title of ["조망점 분석 개요", "조망 검토", "조망점 위치", "색채/재료 선정", "배치계획"]) {
    assert.equal(isTitleLikeAnchor(title), true, title);
  }
  for (const content of ["건축물 하부가 차폐됨", "60.45m", "N, YR계열 색상으로 형성", "옥상조경", "건물높이", "지상 18층"]) {
    assert.equal(isTitleLikeAnchor(content), false, content);
  }
  assert.deepEqual(buildEvidenceAnchors({ anchorText: "조망 검토", note: "원경에서 '건축물 하부가 차폐됨' 서술" }), ["건축물 하부가 차폐됨"]);
  assert.deepEqual(buildEvidenceAnchors({ anchorText: "조망점 분석 개요" }), []);
});

test("구분·항목 문구의 깨진 기호 제거", () => {
  assert.equal(cleanChecklistLabel("배치규모"), "배치규모");
  assert.equal(cleanChecklistLabel("배▤치·규모 "), "배치·규모");
  assert.equal(cleanChecklistLabel("색채ㆍ재료"), "색채ㆍ재료");
  assert.equal(cleanChecklistLabel("배치\u302e규모"), "배치·규모");
});
