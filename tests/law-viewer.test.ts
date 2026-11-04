import { test } from "node:test";
import assert from "node:assert/strict";
import { citedPhrase, findCitedLaw, findHighlight } from "../app/projects/[id]/law-viewer";

const laws = [
  { title: "양평군 경관 조례 시행규칙", article: "[별표 3] 색채 심의기준", summary: "【별표 3 】 색채 심의기준\n색채계획\n기업 고유의 색채계획을 지양하고 기존 주변 환경 및 지역\n 특성을 고려한 색채계획\n외장유리 …", sourceUrl: "u" },
  { title: "양평군 경관 조례 시행규칙", article: "[별표 4] 조명 심의기준", summary: "경관조명 옥탑층 일변도의 고휘도 경관조명 지양", sourceUrl: "u" },
];

test("인용 문구 추출·조문 찾기·강조 구간 (줄바꿈·띄어쓰기 무시)", () => {
  const cited = { title: "양평군 경관 조례 시행규칙", article: "색채계획(기업 고유의 색채계획을 지양하고 기존 주변 환경 및 지역 특성을 고려한 색채계획)" };
  const phrase = citedPhrase(cited.article);
  assert.match(phrase, /^기업 고유의/);
  const law = findCitedLaw(laws, cited);
  assert.equal(law?.article, "[별표 3] 색채 심의기준");
  const range = findHighlight(law!.summary, phrase);
  assert.ok(range);
  assert.match(law!.summary.slice(range![0], range![1]), /^기업 고유의 색채계획을 지양하고 기존 주변 환경 및 지역\n 특성을/);
});

test("새 표기 '[별표 N] 기준명 — 세부'도 처리", () => {
  const cited = { title: "양평군 경관 조례 시행규칙", article: "[별표 4] 조명 심의기준 — 경관조명(옥탑층 일변도의 고휘도 경관조명 지양)" };
  assert.equal(findCitedLaw(laws, cited)?.article, "[별표 4] 조명 심의기준");
  assert.equal(citedPhrase(cited.article), "옥탑층 일변도의 고휘도 경관조명 지양");
});
