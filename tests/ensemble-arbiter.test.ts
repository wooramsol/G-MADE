import assert from "node:assert/strict";
import test from "node:test";
import { resolveArbiterProvider } from "../lib/ai/select-provider";

test("resolveArbiterProvider prefers gemini then claude then openai", () => {
  assert.equal(resolveArbiterProvider(["openai", "claude"]), "claude");
  assert.equal(resolveArbiterProvider(["openai", "gemini"]), "gemini");
  assert.equal(resolveArbiterProvider(["openai"]), "openai");
});
