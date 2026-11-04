import { test } from "node:test";
import assert from "node:assert/strict";
import { findZoneLimit, parseArea, parsePercent } from "../lib/legal-check";
import type { LawArticle } from "../lib/law/corpus";

const article = (title: string, text: string): LawArticle => ({ lawTitle: "양평군 군계획 조례", kind: "ordin", no: "50", title, text, sourceUrl: "u" });

test("면적·비율 숫자 읽기", () => {
  assert.equal(parseArea("7,621.00㎡"), 7621);
  assert.equal(parseArea("873.60㎡"), 873.6);
  assert.equal(parsePercent("11.46%"), 11.46);
  assert.equal(parseArea(undefined), null);
});

test("조례에서 용도지역별 한도 찾기 (긴 이름 안의 짧은 이름은 무시)", () => {
  const bcr = article(
    "용도지역 안에서의 건폐율",
    "제50조(용도지역 안에서의 건폐율) 다음 각 호와 같다. 12. 보전관리지역 : 20퍼센트 이하 13. 생산관리지역 : 20퍼센트 이하 14. 계획관리지역 : 40퍼센트 이하",
  );
  const far = article("용도지역 안에서의 용적률", "제51조(용도지역 안에서의 용적률) 14. 계획관리지역 : 100퍼센트 이하");
  assert.equal(findZoneLimit([bcr, far], "계획관리지역", "건폐율")?.value, 40);
  assert.equal(findZoneLimit([bcr, far], "계획관리지역", "용적률")?.value, 100);
  assert.equal(findZoneLimit([bcr], "관리지역", "건폐율"), null);
});
