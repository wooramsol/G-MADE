import assert from "node:assert/strict";
import test from "node:test";
import { resolveEnsembleInitialOptions } from "../lib/ai/ensemble-initial-options";

test("resolveEnsembleInitialOptions uses fast text-only path for Claude", () => {
  const options = resolveEnsembleInitialOptions("claude");
  assert.equal(options?.ensembleFast, true);
  assert.equal(options?.includeVision, false);
  assert.equal(options?.compact, true);
});

test("resolveEnsembleInitialOptions uses compact mode for OpenAI", () => {
  const options = resolveEnsembleInitialOptions("openai");
  assert.equal(options?.compact, true);
  assert.equal(options?.ensembleFast, undefined);
});
