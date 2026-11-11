import { test } from "node:test";
import assert from "node:assert/strict";
import { activeAnalysisLock, canAccessProject, canEditProjectInfo, isOfficialRole, projectForViewer } from "../lib/roles";
import { isAdaptiveThinkingModel } from "../lib/ai/claude-models";
import { pricingFor } from "../lib/checklist-review/usage-cost";
import type { Project } from "../lib/types";

const file = (id: string) => ({ id, originalName: `${id}.pdf`, fileName: `${id}.pdf`, fileType: "PDF", sizeBytes: 1, storageKey: `projects/p/files/${id}.pdf`, uploadedAt: "", analysisStatus: "완료" });
const project = {
  id: "p",
  name: "t",
  ownerId: "applicant-1",
  stage: "PRE_REVIEW",
  files: [file("sub"), file("internal")],
  submissions: [{ id: "s1", round: 1, submittedAt: "2026-01-01", file: file("sub"), submittedBy: { id: "applicant-1", name: "a", role: "APPLICANT" } }],
  checklistReviews: [{ id: "r1" }],
  reviewers: [{ id: "x", name: "갑", color: "#000000" }],
  preReviewers: [{ id: "y", name: "을", color: "#000000" }],
  departments: ["도시과"],
  analysisLock: { startedAt: new Date().toISOString(), by: "공무원A", byId: "o1" },
} as unknown as Project;

test("역할 판별 — 지원자는 공무원이 아님", () => {
  assert.equal(isOfficialRole("ADMIN"), true);
  assert.equal(isOfficialRole("OFFICER"), true);
  assert.equal(isOfficialRole("APPLICANT"), false);
  assert.equal(isOfficialRole(undefined), false);
});

test("지원자는 자기 프로젝트만 접근", () => {
  assert.equal(canAccessProject({ id: "applicant-1", role: "APPLICANT" }, project), true);
  assert.equal(canAccessProject({ id: "applicant-2", role: "APPLICANT" }, project), false);
  assert.equal(canAccessProject({ id: "o1", role: "OFFICER" }, project), true);
  assert.equal(canAccessProject(null, project), false);
  // 소유자 정보가 없는 프로젝트는 지원자 누구에게도 보이지 않음
  assert.equal(canAccessProject({ id: "applicant-1", role: "APPLICANT" }, { ...project, ownerId: undefined }), false);
});

test("지원자에게는 내부 심의 자료를 보내지 않음", () => {
  const view = projectForViewer(project, false);
  assert.deepEqual(view.checklistReviews, []);
  assert.equal(view.reviewers, undefined);
  assert.equal(view.preReviewers, undefined);
  assert.equal(view.departments, undefined);
  assert.equal(view.analysisLock, undefined);
  assert.deepEqual(view.files.map((entry) => entry.id), ["sub"]);
  // 공무원은 그대로
  assert.equal(projectForViewer(project, true), project);
});

test("접수 후 기본정보는 공무원만 수정", () => {
  assert.equal(canEditProjectInfo({ role: "APPLICANT" }, project), false);
  assert.equal(canEditProjectInfo({ role: "OFFICER" }, project), true);
  assert.equal(canEditProjectInfo({ role: "APPLICANT" }, { ...project, stage: "RECEPTION", submissions: [] }), true);
});

test("분석 잠금 — 5분 반이 지나면 무효", () => {
  assert.ok(activeAnalysisLock(project));
  const old = { analysisLock: { startedAt: new Date(Date.now() - 400_000).toISOString(), by: "a", byId: "b" } };
  assert.equal(activeAnalysisLock(old), null);
  assert.equal(activeAnalysisLock({}), null);
});

test("모델 세대 판별·단가", () => {
  assert.equal(isAdaptiveThinkingModel("claude-sonnet-5-5"), true);
  assert.equal(isAdaptiveThinkingModel("claude-haiku-5-5"), true);
  assert.equal(isAdaptiveThinkingModel("claude-sonnet-4-6"), false);
  assert.equal(isAdaptiveThinkingModel("claude-haiku-4-5"), false);
  assert.equal(pricingFor("claude-sonnet-5-5").input, 2);
  assert.equal(pricingFor("claude-sonnet-4-6").output, 15);
  assert.equal(pricingFor("claude-haiku-4-5").input, 1);
});
