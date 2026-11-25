import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHeaderForMatch, isIdentityAliasHeader, isClassCategoryField, isDobHeader,
  inferSemanticKey, fieldKeyForColumnIndex, isFieldKeyColumnIndex, isMetaColumn,
  buildExcelColumnSchema, inferFormFieldsFromExcelHeaders, inferFormFieldsFromExcelHeadersWithFallback,
  isDynamicFieldKey, isKnownFieldKey, deriveCanonicalValuesFromExtraFields, CANONICAL_FIELD_KEYS,
} from "../../src/utils/excelSchema.ts";

test("normalizeHeaderForMatch strips punctuation/case/space", () => {
  assert.equal(normalizeHeaderForMatch("  Blood-Group! "), "bloodgroup");
});
test("isIdentityAliasHeader", () => {
  assert.equal(isIdentityAliasHeader("id"), true);
  assert.equal(isIdentityAliasHeader("photoid"), true);
  assert.equal(isIdentityAliasHeader("name"), false);
});

test("inferSemanticKey: photo id variants", () => {
  assert.equal(inferSemanticKey("id"), "photo_id");
  assert.equal(inferSemanticKey("photoid"), "photo_id");
  assert.equal(inferSemanticKey("photo"), "photo_id");
  assert.equal(inferSemanticKey("photourl"), null); // url excluded
});
test("inferSemanticKey: class variants", () => {
  for (const h of ["class", "classsection", "section", "grade", "standard", "batch", "division"])
    assert.equal(inferSemanticKey(h), "class_section", h);
});
test("inferSemanticKey: names and parents", () => {
  assert.equal(inferSemanticKey("name"), "student_name");
  assert.equal(inferSemanticKey("studentname"), "student_name");
  assert.equal(inferSemanticKey("fullname"), "student_name");
  assert.equal(inferSemanticKey("membername"), "student_name");
  assert.equal(inferSemanticKey("fathername"), "parent_name");
  assert.equal(inferSemanticKey("mothername"), "parent_name");
  assert.equal(inferSemanticKey("guardian"), "parent_name");
  assert.equal(inferSemanticKey("parentname"), "parent_name");
});
test("inferSemanticKey: name exclusions", () => {
  assert.equal(inferSemanticKey("username"), null);
  assert.equal(inferSemanticKey("filename"), null);
  assert.equal(inferSemanticKey("schoolname"), null);
  assert.equal(inferSemanticKey("institutename"), null);
});
test("inferSemanticKey: phone/address/roll", () => {
  for (const h of ["phone", "mobile", "tel", "whatsapp"]) assert.equal(inferSemanticKey(h), "parent_phone", h);
  assert.equal(inferSemanticKey("contact"), null); // contact without phone excluded
  assert.equal(inferSemanticKey("address"), "address");
  assert.equal(inferSemanticKey("locality"), "address");
  for (const h of ["rollno", "admissionno", "enrollment", "regno", "registerno"]) assert.equal(inferSemanticKey(h), "roll_no", h);
  assert.equal(inferSemanticKey("pen"), null); // custom identifier, not roll
  assert.equal(inferSemanticKey("aadhaar"), null);
});
test("inferSemanticKey: dob/gender/blood", () => {
  assert.equal(inferSemanticKey("dob"), "dob");
  assert.equal(inferSemanticKey("dateofbirth"), "dob");
  assert.equal(inferSemanticKey("gender"), "gender");
  assert.equal(inferSemanticKey("sex"), "gender");
  assert.equal(inferSemanticKey("bloodgroup"), "blood_group");
});
test("inferSemanticKey: unknown => null", () => {
  assert.equal(inferSemanticKey("favouritecolour"), null);
});

test("isDobHeader edge cases", () => {
  assert.equal(isDobHeader(""), false);
  assert.equal(isDobHeader("birthday"), true);
  assert.equal(isDobHeader("birthdate"), true);
  assert.equal(isDobHeader("studentdob"), false); // dob preceded by a letter is not a token
  assert.equal(isDobHeader("2dob"), true); // digit boundary satisfies the token regex
  assert.equal(isDobHeader("doberman"), false); // not a dob token
});

test("isClassCategoryField", () => {
  assert.equal(isClassCategoryField({ key: "fld_1", label: "Class" }), true);
  assert.equal(isClassCategoryField({ key: "fld_2", label: "Grade" }), true);
  assert.equal(isClassCategoryField({ key: "fld_3", label: "Designation" }), false);
  assert.equal(isClassCategoryField({ key: "fld_4", label: "Group" }), false);
  assert.equal(isClassCategoryField({ key: "fld_5", label: "Section" }), false); // section without class
  assert.equal(isClassCategoryField({ key: "fld_6", label: "Photo" }), false);
  assert.equal(isClassCategoryField({ key: "class_section", label: "" }), true);
});

test("fieldKeyForColumnIndex / isFieldKeyColumnIndex", () => {
  assert.equal(fieldKeyForColumnIndex(7), "fld_7");
  assert.equal(isFieldKeyColumnIndex("fld_7"), true);
  assert.equal(isFieldKeyColumnIndex("dyn_7"), false);
  assert.equal(isFieldKeyColumnIndex("student_name"), false);
});

test("isMetaColumn", () => {
  for (const h of ["Created At", "S.No", "Status", "Captured", "Updated On", "Timestamp"])
    assert.equal(isMetaColumn(h), true, h);
  assert.equal(isMetaColumn("Date of Birth"), false);
  assert.equal(isMetaColumn("Join Date"), false);
});

test("buildExcelColumnSchema: drops empty + meta, keeps index", () => {
  const cols = buildExcelColumnSchema(["Name", "", "Status", "Blood Group"]);
  assert.deepEqual(cols.map((c) => [c.label, c.key, c.colIndex]), [["Name", "fld_0", 0], ["Blood Group", "fld_3", 3]]);
});
test("inferFormFieldsFromExcelHeaders + fallback alias", () => {
  const f = inferFormFieldsFromExcelHeaders(["Name", "Class"]);
  assert.equal(f.length, 2);
  assert.equal(f[0].enabled, true);
  assert.equal((f[0] as any).source, "excel");
  assert.deepEqual(inferFormFieldsFromExcelHeadersWithFallback(["Name"]).length, 1);
});

test("isDynamicFieldKey / isKnownFieldKey", () => {
  assert.equal(isDynamicFieldKey("dyn_2"), true);
  assert.equal(isDynamicFieldKey("fld_2"), true);
  assert.equal(isDynamicFieldKey("student_name"), false);
  assert.equal(isKnownFieldKey("signature_upload"), true);
  assert.equal(isKnownFieldKey("photo_id"), true);
  assert.equal(isKnownFieldKey("dyn_9"), true);
  assert.equal(isKnownFieldKey("nope"), false);
  assert.ok(CANONICAL_FIELD_KEYS.includes("blood_group"));
});

test("deriveCanonicalValuesFromExtraFields: maps labels, first-wins, skips empty", () => {
  const cols = [
    { label: "Name", key: "fld_0", colIndex: 0 },
    { label: "Blood Group", key: "fld_1", colIndex: 1 },
    { label: "Full Name", key: "fld_2", colIndex: 2 },
    { label: "Notes", key: "fld_3", colIndex: 3 },
  ];
  const out = deriveCanonicalValuesFromExtraFields(cols, { fld_0: "Asha", fld_1: " O+ ", fld_2: "Asha K", fld_3: "" });
  assert.equal(out.student_name, "Asha"); // first-wins over Full Name
  assert.equal(out.blood_group, "O+");
  assert.equal("address" in out, false);
});
