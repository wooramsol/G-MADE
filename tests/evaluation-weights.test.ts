import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getExpertWeight,
  requiresAiUploadMaterials,
  requiresExpertUploadMaterials,
  validateEvaluationWeights,
} from "../lib/evaluation-weight-requirements";

test("getExpertWeight is complement of aiWeight", () => {
  assert.equal(getExpertWeight(30), 70);
  assert.equal(getExpertWeight(0), 100);
  assert.equal(getExpertWeight(100), 0);
});

test("materials requirements follow weights", () => {
  assert.equal(requiresAiUploadMaterials(0), false);
  assert.equal(requiresAiUploadMaterials(10), true);
  assert.equal(requiresExpertUploadMaterials(0), false);
  assert.equal(requiresExpertUploadMaterials(70), true);
});

test("validateEvaluationWeights accepts valid combinations", () => {
  assert.equal(validateEvaluationWeights(30, 70), null);
  assert.equal(validateEvaluationWeights(0, 100), null);
  assert.equal(validateEvaluationWeights(100, 0), null);
});

test("validateEvaluationWeights rejects invalid combinations", () => {
  assert.notEqual(validateEvaluationWeights(0, 0), null);
  assert.notEqual(validateEvaluationWeights(-10, 110), null);
  assert.notEqual(validateEvaluationWeights(30, 50), null);
  assert.notEqual(validateEvaluationWeights(60, 60), null);
});
