import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRateLimit } from "../lib/rate-limit";

test("allows requests under the limit and blocks over it", () => {
  const key = `test-${Date.now()}`;
  for (let i = 0; i < 3; i += 1) {
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, true);
  }
  const blocked = checkRateLimit(key, 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("separate keys have separate buckets", () => {
  const keyA = `test-a-${Date.now()}`;
  const keyB = `test-b-${Date.now()}`;
  assert.equal(checkRateLimit(keyA, 1, 60_000).allowed, true);
  assert.equal(checkRateLimit(keyA, 1, 60_000).allowed, false);
  assert.equal(checkRateLimit(keyB, 1, 60_000).allowed, true);
});

test("window resets after expiry", async () => {
  const key = `test-expire-${Date.now()}`;
  assert.equal(checkRateLimit(key, 1, 50).allowed, true);
  assert.equal(checkRateLimit(key, 1, 50).allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(checkRateLimit(key, 1, 50).allowed, true);
});
