import { test } from "node:test";
import assert from "node:assert/strict";
import { isMemoId, isProjectFileKey } from "../lib/storage-keys";
import { isTrustedBlobUrl } from "../lib/trusted-blob-url";

test("프로젝트 파일 경로 검사", () => {
  assert.equal(isProjectFileKey("p1", "projects/p1/files/123-abc-도서.pdf"), true);
  assert.equal(isProjectFileKey("p1", "projects/p2/files/a.pdf"), false);
  assert.equal(isProjectFileKey("p1", "projects/p1/files/../p2/files/a.pdf"), false);
  assert.equal(isProjectFileKey("p1", "projects/p1/files/sub/a.pdf"), false);
  assert.equal(isProjectFileKey("p1", "projects/p1/files/"), false);
});

test("의견 id·저장소 주소 검사", () => {
  assert.equal(isMemoId("memo-1b2c3d4e-0000-4000-8000-000000000000"), true);
  assert.equal(isMemoId("../x"), false);
  assert.equal(isTrustedBlobUrl("https://abc.public.blob.vercel-storage.com/x.pdf"), true);
  assert.equal(isTrustedBlobUrl("https://evil.com/x.pdf"), false);
  assert.equal(isTrustedBlobUrl("https://blob.vercel-storage.com.evil.com/x"), false);
  assert.equal(isTrustedBlobUrl("http://abc.blob.vercel-storage.com/x"), false);
});
