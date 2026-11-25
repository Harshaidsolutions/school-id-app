import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isExcelFormField, isManualFormField, withExcelSource, withManualSource, inferFieldSource,
} from "../../src/utils/formFieldSource.ts";

const base = (over: Record<string, unknown> = {}) => ({ key: "k", label: "L", enabled: true, ...over } as any);

test("explicit manual source", () => {
  assert.equal(isExcelFormField(base({ source: "manual" })), false);
  assert.equal(isManualFormField(base({ source: "manual" })), true);
});
test("explicit excel source", () => {
  assert.equal(isExcelFormField(base({ source: "excel" })), true);
});
test("dyn_ keys are manual", () => {
  assert.equal(isExcelFormField(base({ key: "dyn_1" })), false);
});
test("fld_N keys are excel", () => {
  assert.equal(isExcelFormField(base({ key: "fld_3" })), true);
});
test("colIndex present => excel", () => {
  assert.equal(isExcelFormField(base({ key: "x", colIndex: 2 })), true);
});
test("plain custom field => manual", () => {
  assert.equal(isExcelFormField(base({ key: "student_name" })), false);
  assert.equal(isManualFormField(base({ key: "student_name" })), true);
});
test("withExcelSource / withManualSource / inferFieldSource", () => {
  assert.equal(withExcelSource(base()).source, "excel");
  assert.equal(withManualSource(base()).source, "manual");
  assert.equal(inferFieldSource(base({ key: "fld_0" })), "excel");
  assert.equal(inferFieldSource(base({ key: "name" })), "manual");
});
