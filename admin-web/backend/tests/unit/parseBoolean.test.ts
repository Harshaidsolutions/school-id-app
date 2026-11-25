import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBooleanField, captureAllowedFromBody, isOrganizationActive } from "../../src/utils/parseBoolean.ts";

test("parseBooleanField: nullish returns the default", () => {
  assert.equal(parseBooleanField(undefined, true), true);
  assert.equal(parseBooleanField(null, false), false);
});
test("parseBooleanField: booleans pass through", () => {
  assert.equal(parseBooleanField(true, false), true);
  assert.equal(parseBooleanField(false, true), false);
});
test("parseBooleanField: numbers (0 false, non-zero true)", () => {
  assert.equal(parseBooleanField(0, true), false);
  assert.equal(parseBooleanField(5, false), true);
});
test("parseBooleanField: truthy strings", () => {
  for (const v of ["true", "1", "YES", " Yes "]) assert.equal(parseBooleanField(v, false), true, v);
});
test("parseBooleanField: falsy strings", () => {
  for (const v of ["false", "0", "no", " NO "]) assert.equal(parseBooleanField(v, true), false, v);
});
test("parseBooleanField: unknown string falls back to Boolean(value)", () => {
  assert.equal(parseBooleanField("maybe", false), true); // non-empty string is truthy
  assert.equal(parseBooleanField("", false), false);
});
test("parseBooleanField: other types use Boolean()", () => {
  assert.equal(parseBooleanField({}, false), true);
});

test("captureAllowedFromBody: explicit protection flag wins (true => not allowed)", () => {
  assert.equal(captureAllowedFromBody({ screen_capture_protection: true }), false);
  assert.equal(captureAllowedFromBody({ screenCaptureProtection: "false" }), true);
});
test("captureAllowedFromBody: empty-string protection is ignored", () => {
  assert.equal(captureAllowedFromBody({ screen_capture_protection: "" }), true);
});
test("captureAllowedFromBody: allow flags, both must be true", () => {
  assert.equal(captureAllowedFromBody({ allow_screenshot: true, allow_screen_recording: true }), true);
  assert.equal(captureAllowedFromBody({ allow_screenshot: true, allow_screen_recording: false }), false);
  assert.equal(captureAllowedFromBody({ allowScreenshot: false }), false);
});
test("captureAllowedFromBody: defaults to allowed when nothing set", () => {
  assert.equal(captureAllowedFromBody({}), true);
});

test("isOrganizationActive: only explicit false is inactive", () => {
  assert.equal(isOrganizationActive(true), true);
  assert.equal(isOrganizationActive(null), true);
  assert.equal(isOrganizationActive(undefined), true);
  assert.equal(isOrganizationActive(false), false);
});
