import { test } from "node:test";
import assert from "node:assert/strict";
import { yearFilterClause, defaultAcademicYear } from "../../src/utils/yearFilter.ts";

test("yearFilterClause: empty year => no clause", () => {
  assert.deepEqual(yearFilterClause("academic_year", ""), { clause: "", values: [] });
});
test("yearFilterClause: builds a parameterized clause", () => {
  assert.deepEqual(yearFilterClause("academic_year", "2026"), { clause: "WHERE academic_year = $1", values: ["2026"] });
});
test("defaultAcademicYear: current calendar year as a string", () => {
  assert.equal(defaultAcademicYear(), String(new Date().getFullYear()));
});
