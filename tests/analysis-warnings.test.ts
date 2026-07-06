import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupeWarnings,
  filterUserFacingAnalysisWarnings,
  isHiddenAnalysisWarning,
} from "../lib/analysis-warnings";

test("isHiddenAnalysisWarning hides internal correction notices", () => {
  assert.equal(
    isHiddenAnalysisWarning(
      "건축물 스케일 적정성 점수 근거: 제출 자료·조회 맥락에서 확인되지 않은 내용을 보정했습니다 — 존재하지 않는 파일명(심의도서.pdf)",
    ),
    true,
  );
  assert.equal(
    isHiddenAnalysisWarning("경관자원 및 특성 요약: 평가 문구가 포함되어 읽은 위치 목록으로 보정했습니다."),
    true,
  );
  assert.equal(
    isHiddenAnalysisWarning("Gemini 분석: 평가 항목 8개를 2회로 나누어 처리합니다."),
    true,
  );
});

test("filterUserFacingAnalysisWarnings keeps failures and exceptional cases", () => {
  const filtered = filterUserFacingAnalysisWarnings([
    "공간정보 일부 레이어(문화재) 조회에 실패해 결과에 반영되지 않았습니다.",
    "사업 위치(갈지길36번길 29)에 해당하는 경관 조례 검색 결과가 없습니다.",
    "건축물 스케일 적정성 점수 근거: 제출 자료·조회 맥락에서 확인되지 않은 내용을 보정했습니다 — 존재하지 않는 파일명(심의도서.pdf)",
    "전문가 평가 가중치 0%로 자료 분석을 건너뛰었습니다.",
    "공간정보 일부 레이어(문화재) 조회에 실패해 결과에 반영되지 않았습니다.",
  ]);

  assert.deepEqual(filtered, [
    "공간정보 일부 레이어(문화재) 조회에 실패해 결과에 반영되지 않았습니다.",
    "사업 위치(갈지길36번길 29)에 해당하는 경관 조례 검색 결과가 없습니다.",
    "전문가 평가 가중치 0%로 자료 분석을 건너뛰었습니다.",
  ]);
});

test("dedupeWarnings removes duplicate warnings", () => {
  assert.deepEqual(dedupeWarnings(["a", "a", "b"]), ["a", "b"]);
});
