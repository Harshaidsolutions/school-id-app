import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExtraFields, normalizeStudentRow, getStudentFieldValue, setCanonicalFieldOnRow,
  rowToInsertParams, mergeExtraFieldsForSave, buildFieldLabelsFromConfig, studentToApiJson,
  canonicalSyncFromExtra, classFieldKeys,
} from "../../src/utils/studentFieldAccess.ts";

test("parseExtraFields: object, string JSON, trims, nulls, junk", () => {
  assert.deepEqual(parseExtraFields({ a: " x ", b: null, c: 5 }), { a: "x", b: null, c: "5" });
  assert.deepEqual(parseExtraFields('{"a":" y "}'), { a: "y" });
  assert.deepEqual(parseExtraFields("not json"), {});
  assert.deepEqual(parseExtraFields(null), {});
  assert.deepEqual(parseExtraFields([1, 2]), {});
  assert.deepEqual(parseExtraFields({ a: "   " }), { a: null });
});
test("normalizeStudentRow normalizes extra_fields", () => {
  assert.deepEqual(normalizeStudentRow({ extra_fields: '{"a":"1"}' }).extra_fields, { a: "1" });
});
test("getStudentFieldValue: extra wins, then canonical, then dynamic empty", () => {
  const s: any = { extra_fields: { fld_0: "Asha" }, field_labels: { fld_0: "Name" }, student_name: "DB Name" };
  assert.equal(getStudentFieldValue(s, "fld_0"), "Asha");
  const s2: any = { extra_fields: {}, field_labels: { fld_1: "Blood Group" }, blood_group: "O+" };
  assert.equal(getStudentFieldValue(s2, "fld_1"), "O+"); // canonical via label
  assert.equal(getStudentFieldValue(s2, "fld_9", { fieldLabel: "Notes" }), ""); // unknown label -> ""
  assert.equal(getStudentFieldValue({ extra_fields: {} } as any, "dyn_1"), ""); // dynamic
  assert.equal(getStudentFieldValue({ blood_group: "A+" } as any, "blood_group"), "A+"); // canonical direct
  assert.equal(getStudentFieldValue({ custom_z: "v" } as any, "custom_z"), "v"); // direct passthrough
  assert.equal(getStudentFieldValue({} as any, "blood_group"), ""); // null canonical
});
test("getStudentFieldValue: Date canonical formats to ISO date", () => {
  const s: any = { extra_fields: {}, dob: new Date("2026-05-06T00:00:00Z") };
  assert.equal(getStudentFieldValue(s, "dob"), "2026-05-06");
});
test("getStudentFieldValue: fld_ label maps to a Date column", () => {
  const s: any = { extra_fields: {}, field_labels: { fld_2: "DOB" }, dob: new Date("2026-07-08T00:00:00Z") };
  assert.equal(getStudentFieldValue(s, "fld_2"), "2026-07-08");
  // fld_ label maps to a semantic with no stored value -> empty
  assert.equal(getStudentFieldValue({ extra_fields: {}, field_labels: { fld_3: "Address" } } as any, "fld_3"), "");
  // fld_ label that maps to no semantic column -> empty
  assert.equal(getStudentFieldValue({ extra_fields: {}, field_labels: { fld_4: "Notes" } } as any, "fld_4"), "");
  // field_labels provided as a JSON string (parseFieldLabels string branch)
  assert.equal(getStudentFieldValue({ extra_fields: {}, field_labels: '{"fld_5":"Blood Group"}', blood_group: "B+" } as any, "fld_5"), "B+");
  // invalid JSON field_labels -> parsed as empty, no canonical mapping
  assert.equal(getStudentFieldValue({ extra_fields: {}, field_labels: "not json", blood_group: "B+" } as any, "fld_5"), "");
});
test("setCanonicalFieldOnRow maps every canonical key", () => {
  const t: any = {};
  for (const [k, prop] of [["photo_id","photoId"],["class_section","classSection"],["student_name","studentName"],["parent_name","parentName"],["parent_phone","parentPhone"],["address","address"],["roll_no","rollNo"],["dob","dob"],["gender","gender"],["blood_group","bloodGroup"],["custom_1","custom1"],["custom_2","custom2"],["custom_3","custom3"]] as const) {
    setCanonicalFieldOnRow(t, k, "v");
    assert.equal(t[prop], k === "photo_id" || k === "class_section" || k === "student_name" || k === "parent_name" || k === "parent_phone" ? "v" : "v");
  }
  setCanonicalFieldOnRow(t, "unknown", "x"); // default no-op
  setCanonicalFieldOnRow(t, "photo_id", null); // nullish -> ""
  assert.equal(t.photoId, "");
});
test("rowToInsertParams: normal + bulkImport fallbacks", () => {
  const row: any = { excelRow: 3, extraFields: { photo_id: "P1", class_section: "5A", student_name: "Asha", address: "Road" } };
  const normal = rowToInsertParams(row);
  assert.equal(normal.photoId, "P1");
  assert.equal(normal.address, "Road");
  const bulk = rowToInsertParams({ excelRow: 9, extraFields: {} } as any, { bulkImport: true });
  assert.equal(bulk.photoId, "IMP-9");
  assert.equal(bulk.classSection, "UNKNOWN");
  assert.equal(bulk.address, null);
});
test("mergeExtraFieldsForSave: non-empty overwrites, empty only when nothing existed, disabled skipped", () => {
  const out = mergeExtraFieldsForSave(
    [{ key: "a", enabled: true }, { key: "b", enabled: true }, { key: "c", enabled: false }, { key: "d", enabled: true }],
    { a: "old", b: "keep", d: null },
    { a: "new", b: "", c: "x", d: "" }
  );
  assert.equal(out.a, "new");       // overwrite
  assert.equal(out.b, "keep");      // empty does not wipe existing
  assert.equal(out.c, undefined);   // disabled, not written
  assert.equal(out.d, null);        // empty, nothing existed
});
test("buildFieldLabelsFromConfig", () => {
  assert.deepEqual(buildFieldLabelsFromConfig([{ key: "fld_0", label: "Name" }, { key: "", label: "x" }, { key: "fld_1", label: "" }]), { fld_0: "Name" });
});
test("studentToApiJson", () => {
  const j = studentToApiJson({ id: "1", extra_fields: { a: "1" }, field_labels: null } as any);
  assert.deepEqual(j.extra_fields, { a: "1" });
  assert.equal(j.field_labels, null);
  assert.equal(studentToApiJson({ id: "2", extra_fields: {} } as any).extra_fields, null);
});
test("canonicalSyncFromExtra: follows edited excel cols into fixed columns", () => {
  const out = canonicalSyncFromExtra(
    [{ key: "fld_0", label: "Full Name", enabled: true }, { key: "fld_1", label: "Phone", enabled: true }, { key: "fld_2", label: "Blood Group", enabled: false }],
    { fld_0: "Asha", fld_1: "" }
  );
  assert.equal(out.student_name, "Asha");
  assert.equal(out.parent_phone, null); // emptied phone follows
  assert.equal("blood_group" in out, false); // disabled skipped
});
test("canonicalSyncFromExtra: name not blanked, dob must be valid date", () => {
  const out = canonicalSyncFromExtra(
    [{ key: "fld_0", label: "Name", enabled: true }, { key: "fld_1", label: "DOB", enabled: true }],
    { fld_0: "", fld_1: "notadate" }
  );
  assert.equal("student_name" in out, false); // empty name skipped
  assert.equal("dob" in out, false); // invalid date skipped
});
test("classFieldKeys", () => {
  assert.deepEqual(classFieldKeys([{ key: "class_section", label: "x" }, { key: "fld_3", label: "Grade" }, { key: "fld_4", label: "Name" }]), ["class_section", "fld_3"]);
});
