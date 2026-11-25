import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcelFormField, isManualFormField, sortFormFields, withSequentialDisplayOrder, formFieldRowId, mergeFormFields, isPhotoExcelField, studentFieldDisplay } from "../../src/constants/formFields.ts";
import { activeFormFields, hasFormField, formFieldLabel, findStudentNameField, configuredCategoryFields, niceLabel, wiseActionLabel, allValuesLabel, isClassCategoryField, findClassField, isPlainPhotoPrompt, isGenderField, isBloodGroupField, isDobField, isAddressField } from "../../src/utils/formFieldHelpers.ts";

const F = (o: Record<string, unknown>) => ({ enabled: true, ...o } as any);

test("isExcelFormField / isManualFormField", () => {
  assert.equal(isExcelFormField(F({ key: "fld_0", label: "X" })), true);
  assert.equal(isExcelFormField(F({ key: "dyn_1", label: "X" })), false);
  assert.equal(isExcelFormField(F({ key: "student_name", label: "Name", source: "manual" })), false);
  assert.equal(isManualFormField(F({ key: "student_name", label: "Name" })), true);
});
test("sortFormFields + withSequentialDisplayOrder + formFieldRowId", () => {
  const sorted = sortFormFields([F({ key: "b", label: "B", displayOrder: 2 }), F({ key: "a", label: "A", displayOrder: 1 })]);
  assert.deepEqual(sorted.map((f) => f.key), ["a", "b"]);
  const seq = withSequentialDisplayOrder([F({ key: "a", label: "A" }), F({ key: "b", label: "B" })]);
  assert.deepEqual(seq.map((f) => f.displayOrder), [0, 1]);
  assert.equal(formFieldRowId(F({ key: "x", label: "X", colIndex: 3 }), 0), "excel:3:x");
  assert.equal(formFieldRowId(F({ key: "dyn_1", label: "X" }), 0), "dyn_1");
  assert.match(formFieldRowId(F({ key: "student_name", label: "N" }), 2), /^field:student_name:order:/);
});
test("mergeFormFields + isPhotoExcelField", () => {
  assert.deepEqual(mergeFormFields([]), []);
  assert.deepEqual(mergeFormFields([{ key: "a", label: " A ", enabled: false } as any]), [{ key: "a", label: "A", enabled: false }]);
  assert.equal(isPhotoExcelField({ key: "photo_id", label: "x" }), true);
  assert.equal(isPhotoExcelField({ label: "Photo" }), true);
  assert.equal(isPhotoExcelField({ label: "Photo URL" }), false);
});
test("studentFieldDisplay: photo identity + canonical + dash", () => {
  assert.equal(studentFieldDisplay({ photo_id: "P9", extra_fields: {} } as any, "photo_id"), "P9");
  assert.equal(studentFieldDisplay({ blood_group: "O+", extra_fields: {} } as any, "blood_group"), "O+");
  assert.equal(studentFieldDisplay({ extra_fields: {} } as any, "student_name"), "—");
});

test("activeFormFields / hasFormField / formFieldLabel", () => {
  const fields = [F({ key: "a", label: "A", displayOrder: 1 }), F({ key: "b", label: "B", enabled: false, displayOrder: 0 })];
  assert.deepEqual(activeFormFields(fields).map((f) => f.key), ["a"]);
  assert.equal(hasFormField(fields, "a"), true);
  assert.equal(hasFormField(fields, "b"), false);
  assert.equal(formFieldLabel(fields, "a", "fallback"), "A");
  assert.equal(formFieldLabel(fields, "z", "fallback"), "fallback");
});
test("findStudentNameField / findClassField", () => {
  assert.equal(findStudentNameField([F({ key: "fld_0", label: "Full Name" })])?.key, "fld_0");
  assert.equal(findClassField([F({ key: "fld_1", label: "Class" })])?.key, "fld_1");
});
test("configuredCategoryFields: marked group vs detected", () => {
  assert.deepEqual(configuredCategoryFields([F({ key: "g", label: "House", isGroup: true })]), [{ kind: "group", key: "g", label: "House" }]);
  const detected = configuredCategoryFields([F({ key: "fld_0", label: "Class" }), F({ key: "fld_1", label: "Designation" }), F({ key: "fld_2", label: "Department" })]);
  assert.deepEqual(detected.map((c) => c.kind).sort(), ["class", "department", "designation"]);
});
test("niceLabel / wiseActionLabel / allValuesLabel", () => {
  assert.equal(niceLabel("CLASS"), "Class");
  assert.equal(niceLabel("Already Nice"), "Already Nice");
  assert.equal(wiseActionLabel("DELETE", "CLASS", "Photos"), "Delete Class-wise Photos");
  assert.equal(wiseActionLabel("DOWNLOAD", "GROUP"), "Download Group-wise");
  assert.equal(allValuesLabel("class"), "All Classes");
  assert.equal(allValuesLabel("Designation"), "All Designations");
  assert.match(allValuesLabel("HOUSE"), /All House/);
});
test("field type predicates", () => {
  assert.equal(isClassCategoryField(F({ key: "fld_0", label: "Class" })), true);
  assert.equal(isClassCategoryField(F({ key: "fld_1", label: "Designation" })), false);
  assert.equal(isPlainPhotoPrompt(F({ key: "photo_id", label: "Photo" })), true);
  assert.equal(isPlainPhotoPrompt(F({ key: "fld_2", label: "Photo Number" })), false);
  assert.equal(isGenderField(F({ key: "x", label: "Sex" })), true);
  assert.equal(isBloodGroupField(F({ key: "x", label: "Blood Group" })), true);
  assert.equal(isDobField(F({ key: "x", label: "Date of Birth" })), true);
  assert.equal(isAddressField(F({ key: "x", label: "Residential Address" })), true);
});
