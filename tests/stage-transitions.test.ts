import { test } from "node:test";
import assert from "node:assert/strict";
import { applicantSubmissionKind, canSetStage, phaseWritable, projectStage } from "../lib/roles";
import type { Project } from "../lib/types";

const base = { id: "p", name: "t" } as unknown as Project;
const sub = (id: string, at: string) => ({ id, round: 1, submittedAt: at, file: { id, originalName: "a.pdf", fileType: "application/pdf", sizeBytes: 1, storageKey: "k" }, submittedBy: { id: "u", name: "u", role: "APPLICANT" } });

test("단계 직접 변경은 정해진 되돌리기·종료만 허용", () => {
  assert.equal(canSetStage("MAIN_REVIEW", "CLOSED"), true);
  assert.equal(canSetStage("PRE_REVIEW", "CLOSED"), false);
  assert.equal(canSetStage("SCREENING", "MAIN_REVIEW"), false);
  assert.equal(canSetStage("CLOSED", "MAIN_REVIEW"), true);
  assert.equal(canSetStage("MAIN_REVIEW", "PRE_REVIEW"), true);
  assert.equal(canSetStage("REJECTED", "SCREENING"), true);
  assert.equal(canSetStage("WITHDRAWN", "SCREENING"), false);
  assert.equal(canSetStage("SCREENING", "WITHDRAWN"), false);
  assert.equal(canSetStage("RECEPTION", "SCREENING"), false);
});

test("아직 도달하지 않은 단계·반려·철회는 분석·의견 작성 불가", () => {
  assert.equal(phaseWritable({ ...base, stage: "SCREENING" }, "pre"), false);
  assert.equal(phaseWritable({ ...base, stage: "PRE_REVIEW" }, "pre"), true);
  assert.equal(phaseWritable({ ...base, stage: "PRE_REVIEW" }, "main"), false);
  assert.equal(phaseWritable({ ...base, stage: "MAIN_REVIEW" }, "main"), true);
  assert.equal(phaseWritable({ ...base, stage: "WITHDRAWN" }, "pre"), false);
  assert.equal(phaseWritable({ ...base, stage: "REJECTED" }, "pre"), false);
});

test("지원자 제출 가능 시점", () => {
  assert.equal(applicantSubmissionKind({ ...base, stage: "RECEPTION" }), "initial");
  const screening = { ...base, stage: "SCREENING", submissions: [sub("s1", "2026-01-01")] } as Project;
  assert.equal(applicantSubmissionKind(screening), null);
  const revision = { ...screening, preReviewDecisions: [{ id: "d", decision: "보완요청", decidedAt: "2026-01-02", decidedBy: { id: "o", name: "o" } }] } as Project;
  assert.equal(applicantSubmissionKind(revision), "revision");
  const pre = { ...screening, stage: "PRE_REVIEW" } as Project;
  assert.equal(applicantSubmissionKind(pre), null);
  assert.equal(applicantSubmissionKind({ ...pre, preReviewNotifiedAt: "2026-01-03" }), "main");
  assert.equal(applicantSubmissionKind({ ...pre, preReviewNotifiedAt: "2026-01-03", mainReviewSubmissionId: "s2" }), null);
  assert.equal(applicantSubmissionKind({ ...base, stage: "CLOSED" }), null);
  assert.equal(applicantSubmissionKind({ ...base, stage: "WITHDRAWN" }), null);
});

test("기존 프로젝트(단계 없음) 추정", () => {
  assert.equal(projectStage(base), "RECEPTION");
  assert.equal(projectStage({ ...base, submissions: [sub("s1", "x")] } as Project), "SCREENING");
});
