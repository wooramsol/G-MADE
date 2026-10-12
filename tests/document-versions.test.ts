import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentVersions, comparePageHashes } from "../lib/checklist-review/document-versions";
import type { ChecklistReview } from "../lib/checklist-review/types";

const review = (id: string, at: string, contentHash: string, pageHashes?: string[], name = "도서.pdf") =>
  ({
    id,
    reviewedAt: at,
    files: [{ id: "f", originalName: name, fileType: "pdf", sizeBytes: 1, contentHash, pageHashes }],
  }) as unknown as ChecklistReview;

test("페이지 비교: 끼워넣기·삭제로 번호가 밀려도 내용이 같으면 동일", () => {
  const change = comparePageHashes(["a", "b", "c", "d"], ["a", "x", "b", "c", "d"]);
  assert.deepEqual(
    { unchanged: change.unchanged, modified: change.modified, added: change.added, removed: change.removed },
    { unchanged: 4, modified: 0, added: 1, removed: 0 },
  );
  assert.deepEqual(change.changedPages, [2]);
});

test("페이지 비교: 수정·삭제 구분", () => {
  const change = comparePageHashes(["a", "b", "c", "d"], ["a", "B2", "d"]);
  assert.equal(change.unchanged, 2);
  assert.equal(change.modified, 1);
  assert.equal(change.removed, 1);
  assert.equal(change.added, 0);
});

test("버전: 같은 내용은 파일명이 달라도 한 버전, 첫 검토 순으로 1차 제출·2차 보완, 사용자 이름 우선", () => {
  const versions = buildDocumentVersions(
    [
      review("r3", "2026-10-12T05:00:00Z", "H2", ["a", "x"]),
      review("r1", "2026-09-04T05:00:00Z", "H1", ["a", "b"]),
      review("r2", "2026-09-15T05:00:00Z", "H1", ["a", "b"], "도서_사본.pdf"),
    ],
    { "h:H2": "보완1" },
  );
  assert.equal(versions.length, 2);
  assert.equal(versions[0].label, "1차 제출");
  assert.deepEqual(
    versions[0].reviews.map((entry) => entry.id),
    ["r2", "r1"],
  );
  assert.equal(versions[1].label, "보완1");
  assert.equal(versions[1].defaultLabel, "2차 보완");
  assert.equal(versions[1].change?.modified, 1);
});
