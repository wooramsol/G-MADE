import assert from "node:assert/strict";
import { test } from "node:test";
import { getReleaseVersionLabel, RELEASE_PR_NUMBER } from "../lib/release-version";

test("getReleaseVersionLabel prefers PR number from Vercel commit message", () => {
  const previousMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const previousBuildPr = process.env.NEXT_PUBLIC_RELEASE_PR;

  process.env.VERCEL_GIT_COMMIT_MESSAGE = "Merge pull request #76 from wooramsol/cursor/fix-page-citation-grounding-87a3";
  delete process.env.NEXT_PUBLIC_RELEASE_PR;
  delete process.env.NEXT_PUBLIC_RELEASE_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;

  assert.equal(getReleaseVersionLabel(), "PR #76");

  if (previousMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
  else process.env.VERCEL_GIT_COMMIT_MESSAGE = previousMessage;

  if (previousBuildPr === undefined) delete process.env.NEXT_PUBLIC_RELEASE_PR;
  else process.env.NEXT_PUBLIC_RELEASE_PR = previousBuildPr;
});

test("getReleaseVersionLabel uses build PR when commit message has no PR number", () => {
  const previousMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const previousBuildPr = process.env.NEXT_PUBLIC_RELEASE_PR;

  process.env.VERCEL_GIT_COMMIT_MESSAGE = "Fix PDF page citation grounding for TOC vs drawing pages";
  process.env.NEXT_PUBLIC_RELEASE_PR = "76";
  delete process.env.NEXT_PUBLIC_RELEASE_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;

  assert.equal(getReleaseVersionLabel(), "PR #76");

  if (previousMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
  else process.env.VERCEL_GIT_COMMIT_MESSAGE = previousMessage;

  if (previousBuildPr === undefined) delete process.env.NEXT_PUBLIC_RELEASE_PR;
  else process.env.NEXT_PUBLIC_RELEASE_PR = previousBuildPr;
});

test("getReleaseVersionLabel exposes short SHA for direct-push deploys", () => {
  const previousMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const previousBuildPr = process.env.NEXT_PUBLIC_RELEASE_PR;
  const previousSha = process.env.NEXT_PUBLIC_RELEASE_SHA;

  process.env.VERCEL_GIT_COMMIT_MESSAGE = "Fix PDF page citation grounding";
  delete process.env.NEXT_PUBLIC_RELEASE_PR;
  process.env.NEXT_PUBLIC_RELEASE_SHA = "cd4ee7c1234567890abcdef";

  // 배포 확인용: PR 번호가 없으면 커밋 short SHA를 그대로 보여준다.
  assert.equal(getReleaseVersionLabel(), "cd4ee7c");

  if (previousMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
  else process.env.VERCEL_GIT_COMMIT_MESSAGE = previousMessage;

  if (previousBuildPr === undefined) delete process.env.NEXT_PUBLIC_RELEASE_PR;
  else process.env.NEXT_PUBLIC_RELEASE_PR = previousBuildPr;

  if (previousSha === undefined) delete process.env.NEXT_PUBLIC_RELEASE_SHA;
  else process.env.NEXT_PUBLIC_RELEASE_SHA = previousSha;
});

test("getReleaseVersionLabel combines PR number and short SHA when both exist", () => {
  const previousMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const previousSha = process.env.NEXT_PUBLIC_RELEASE_SHA;

  process.env.VERCEL_GIT_COMMIT_MESSAGE = "Merge pull request #105 from wooramsol/some-branch";
  process.env.NEXT_PUBLIC_RELEASE_SHA = "abc12345678";

  assert.equal(getReleaseVersionLabel(), "PR #105 · abc1234");

  if (previousMessage === undefined) delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
  else process.env.VERCEL_GIT_COMMIT_MESSAGE = previousMessage;

  if (previousSha === undefined) delete process.env.NEXT_PUBLIC_RELEASE_SHA;
  else process.env.NEXT_PUBLIC_RELEASE_SHA = previousSha;
});

test("RELEASE_PR_NUMBER tracks latest merged PR", () => {
  assert.equal(RELEASE_PR_NUMBER, 104);
});
