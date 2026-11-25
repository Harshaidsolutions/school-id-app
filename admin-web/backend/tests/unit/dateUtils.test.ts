import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeDateValue, normalizeDateForDb, captureDayKey, safeDateColumnValue } from "../../src/utils/dateUtils.ts";

test("looksLikeDateValue: ISO and DMY", () => {
  assert.equal(looksLikeDateValue("2026-01-02"), true);
  assert.equal(looksLikeDateValue("02/01/2026"), true);
  assert.equal(looksLikeDateValue("2.1.2026"), true);
});
test("looksLikeDateValue: rejects empty, names, bad DMY", () => {
  assert.equal(looksLikeDateValue("  "), false);
  assert.equal(looksLikeDateValue("Priyanka Sharma"), false);
  assert.equal(looksLikeDateValue("45/13/2026"), false); // invalid month/day -> falls to Date.parse, letters<=3 -> but no letters; Date.parse NaN => false
});
test("looksLikeDateValue: parseable textual date with few letters", () => {
  assert.equal(looksLikeDateValue("Jan 2 2026"), true); // 3 letters, Date.parse ok
});
test("normalizeDateForDb", () => {
  assert.equal(normalizeDateForDb("2026-03-04"), "2026-03-04");
  assert.equal(normalizeDateForDb("4/3/2026"), "2026-03-04");
  assert.equal(normalizeDateForDb("not a date"), null);
  assert.equal(normalizeDateForDb("  "), null);
});
test("captureDayKey", () => {
  assert.equal(captureDayKey(null), null);
  assert.equal(captureDayKey("garbage"), null);
  assert.match(captureDayKey("2026-01-01T00:00:00Z") as string, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(captureDayKey(new Date("2026-06-15T12:00:00Z")) as string, /^2026-06-15$/);
});
test("safeDateColumnValue: only for DOB headers with valid dates", () => {
  assert.equal(safeDateColumnValue("2026-01-02", "Date of Birth"), "2026-01-02");
  assert.equal(safeDateColumnValue("2026-01-02", "Join Date"), null); // not a dob header
  assert.equal(safeDateColumnValue("", "DOB"), null);
  assert.equal(safeDateColumnValue("hello", "DOB"), null);
  assert.equal(safeDateColumnValue("2026-01-02", undefined), null);
});
