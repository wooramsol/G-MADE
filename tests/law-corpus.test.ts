import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLawArticles, parseOrdinArticles, selectRelevantArticles } from "../lib/law/corpus";

const lawPayload = {
  법령: {
    기본정보: { 법령명_한글: "경관법" },
    조문: {
      조문단위: [
        { 조문번호: "1", 조문여부: "조문", 조문제목: "목적", 조문내용: "제1조(목적) 이 법은 ..." },
        {
          조문번호: "28",
          조문여부: "조문",
          조문제목: "건축물의 경관 심의",
          조문내용: "제28조(건축물의 경관 심의)",
          항: [
            { 항번호: "①", 항내용: "① 다음 각 호의 건축물은 심의를 거쳐야 한다.", 호: [{ 호내용: "1. 경관지구의 건축물" }] },
            { 항번호: "②", 항내용: "② 심의기준은 고시한다." },
          ],
        },
      ],
    },
  },
};

test("국가법령 조문: 항·호까지 본문을 이어 붙임", () => {
  const articles = parseLawArticles(lawPayload, { title: "경관법", sourceUrl: "u" });
  const article28 = articles.find((article) => article.no === "28");
  assert.ok(article28);
  assert.match(article28.text, /경관지구의 건축물/);
  assert.match(article28.text, /심의기준은 고시한다/);
});

const ordinPayload = {
  LawService: {
    자치법규기본정보: { 자치법규명: "양평군 경관 조례" },
    조문: {
      조: [
        { 조내용: "제1장 총칙", 조문여부: "N" },
        { 조제목: "색채", 조내용: "제12조(색채) 건축물의 외벽 색채는 주변 자연경관과 조화되는 저채도 색상을 사용한다.", 조문여부: "Y" },
        { 조제목: "옥외광고물", 조내용: "제13조(옥외광고물) 간판은 건물 입면과 조화되게 설치한다.", 조문여부: "Y" },
      ],
    },
  },
};

test("자치법규 조문 파싱 + 항목별 관련 조문 선정", () => {
  const articles = parseOrdinArticles(ordinPayload, { title: "양평군 경관 조례", sourceUrl: "u" });
  assert.equal(articles.length, 2);
  const { byItem } = selectRelevantArticles(articles, [
    { id: "c1", text: "건축물 외벽의 색채는 주변과 조화되는 색상 계획" },
    { id: "c2", text: "간판 등 옥외광고물 계획" },
  ]);
  assert.deepEqual(byItem.get("c1"), ["양평군 경관 조례#12"]);
  assert.deepEqual(byItem.get("c2"), ["양평군 경관 조례#13"]);
});

test("긴 심의기준 조문은 호 단위로 나눔", async () => {
  const { splitLongArticle, articleLabel } = await import("../lib/law/corpus");
  const filler = "가".repeat(400);
  const text = `제6조(경관 심의기준) 심의기준은 다음 각 호에 의한다. 1. 공공건축물 ${filler} 2. 공공시설물 ${filler} 3. 색채 저채도 색상 사용 ${filler} 4. 조명 ${filler}`;
  const parts = splitLongArticle({ lawTitle: "양평군 경관 조례 시행규칙", kind: "ordin", no: "6", title: "경관 심의기준", text, sourceUrl: "u" });
  assert.equal(parts.length, 4);
  assert.equal(articleLabel(parts[2]), "제6조제3호(색채)");
  assert.match(parts[2].text, /저채도/);
});

test("기준 문구로 쓴 인용을 별표 표기로 바로잡음", async () => {
  const { normalizeArticleRef } = await import("../lib/checklist-review/evaluate-items");
  const index = [
    { title: "양평군 경관 조례 시행규칙", article: "[별표 3] 색채 심의기준 (1/2)", summary: "색채계획 기업 고유의 색채계획을 지양하고 기존 주변 환경 및 지역 특성을 고려한 색채계획" },
    { title: "양평군 경관 조례 시행규칙", article: "[별표 4] 조명 심의기준", summary: "경관조명 옥탑층 일변도의 고휘도 경관조명 지양" },
  ];
  assert.equal(
    normalizeArticleRef("색채계획(기업 고유의 색채계획을 지양하고 기존 주변 환경)", "양평군 경관 조례 시행규칙", index),
    "[별표 3] 색채 심의기준 — 색채계획(기업 고유의 색채계획을 지양하고 기존 주변 환경)",
  );
  assert.equal(normalizeArticleRef("제12조(색채)", "x", index), "제12조(색채)");
});
