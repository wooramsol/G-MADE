import { test } from "node:test";
import assert from "node:assert/strict";
import { applicantSubmissionKind, canSetStage, phaseCompleted, phaseWritable, projectProgressStep, projectStage, recordStageChange, stepCompletedAt } from "../lib/roles";
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

test("다음 단계로 넘어가면 이전 단계는 완료·잠금", () => {
  assert.equal(phaseWritable({ ...base, stage: "MAIN_REVIEW" }, "pre"), false);
  assert.equal(phaseWritable({ ...base, stage: "CLOSED" }, "pre"), false);
  assert.equal(phaseWritable({ ...base, stage: "CLOSED" }, "main"), false);
  assert.equal(phaseCompleted({ ...base, stage: "PRE_REVIEW" }, "pre"), false);
  assert.equal(phaseCompleted({ ...base, stage: "MAIN_REVIEW" }, "pre"), true);
  assert.equal(phaseCompleted({ ...base, stage: "MAIN_REVIEW" }, "main"), false);
  assert.equal(phaseCompleted({ ...base, stage: "CLOSED" }, "main"), true);
  assert.equal(phaseCompleted({ ...base, stage: "REJECTED" }, "pre"), false);
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

test("단계가 바뀌면 들어선 시각을 기록하고, 되돌리면 뒤 단계 기록을 지운다", () => {
  const screening = recordStageChange({ ...base, stage: "RECEPTION" }, { ...base, stage: "SCREENING" }, "2026-01-01T00:00:00.000Z");
  assert.equal(screening.stageEnteredAt?.SCREENING, "2026-01-01T00:00:00.000Z");
  const pre = recordStageChange(screening, { ...screening, stage: "PRE_REVIEW" }, "2026-01-02T00:00:00.000Z");
  const main = recordStageChange(pre, { ...pre, stage: "MAIN_REVIEW" }, "2026-01-03T00:00:00.000Z");
  assert.equal(stepCompletedAt(main, 1), "2026-01-01T00:00:00.000Z");
  assert.equal(stepCompletedAt(main, 2), "2026-01-02T00:00:00.000Z");
  assert.equal(stepCompletedAt(main, 3), "2026-01-03T00:00:00.000Z");
  assert.equal(stepCompletedAt(main, 4), undefined);
  const back = recordStageChange(main, { ...main, stage: "PRE_REVIEW" }, "2026-01-04T00:00:00.000Z");
  assert.equal(back.stageEnteredAt?.MAIN_REVIEW, undefined);
  // 되돌아간 단계의 시각(= 사전검토 완료 시각)은 그대로
  assert.equal(back.stageEnteredAt?.PRE_REVIEW, "2026-01-02T00:00:00.000Z");
  assert.equal(stepCompletedAt(back, 2), "2026-01-02T00:00:00.000Z");
  // 반려 취소(반려 → 사전검토)도 도서접수 완료 시각을 바꾸지 않는다
  const rejected = { ...screening, stage: "REJECTED" as const };
  assert.equal(recordStageChange(rejected, { ...rejected, stage: "SCREENING" }, "2026-02-01T00:00:00.000Z").stageEnteredAt?.SCREENING, "2026-01-01T00:00:00.000Z");
  // 단계가 그대로면 아무것도 바꾸지 않는다
  assert.equal(recordStageChange(main, main), main);
  assert.equal(projectProgressStep({ ...base, stage: "WITHDRAWN", withdrawnFromStage: "PRE_REVIEW" }), 3);
  assert.equal(projectProgressStep({ ...base, stage: "REJECTED" }), 2);
});
