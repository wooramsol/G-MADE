import assert from "node:assert/strict";
import test from "node:test";
import { parseExtractedItems } from "../lib/checklist-review/extract-items";

test("같은 구분·같은 문구의 체크리스트 항목은 한 번만 추출", () => {
  const raw = JSON.stringify([
    { category: "배치·규모", text: "주변의 자연경관 및 인접 건축물과의 연속성을 확보하는 조화로운 계획", fileName: "a.pdf", page: 3 },
    { category: "배치ㆍ규모", text: "주변의 자연경관 및  인접 건축물과의 연속성을 확보하는 조화로운 계획", fileName: "a.pdf", page: 90 },
    { category: "색채", text: "주변의 자연경관 및 인접 건축물과의 연속성을 확보하는 조화로운 계획", fileName: "a.pdf", page: 4 },
    { category: "색채", text: "주변과 조화되는 색채 계획", fileName: "a.pdf", page: 4 },
  ]);
  const items = parseExtractedItems(raw);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.id), ["c1", "c2", "c3"]);
  assert.equal(items[0].source?.page, 3);
});
