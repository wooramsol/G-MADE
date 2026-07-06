import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeCallbackUrl } from "../lib/safe-callback-url";

test("allows same-origin relative paths", () => {
  assert.equal(sanitizeCallbackUrl("/projects"), "/projects");
  assert.equal(sanitizeCallbackUrl("/projects/abc?tab=1"), "/projects/abc?tab=1");
  assert.equal(sanitizeCallbackUrl("/"), "/");
});

test("blocks open redirect attempts", () => {
  assert.equal(sanitizeCallbackUrl("//evil.com"), "/");
  assert.equal(sanitizeCallbackUrl("/\\evil.com"), "/");
  assert.equal(sanitizeCallbackUrl("https://evil.com"), "/");
  assert.equal(sanitizeCallbackUrl("javascript:alert(1)"), "/");
});

test("falls back to root for non-string values", () => {
  assert.equal(sanitizeCallbackUrl(undefined), "/");
  assert.equal(sanitizeCallbackUrl(null), "/");
  assert.equal(sanitizeCallbackUrl(42), "/");
});
