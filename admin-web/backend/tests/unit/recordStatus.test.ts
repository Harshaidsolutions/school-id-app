import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";

let formFields: any[] = [];
mock.module("../../src/controllers/formConfigController.ts", {
  namedExports: { loadFormConfigForOrg: async () => formFields },
});
const load = () => import("../../src/utils/recordStatus.ts");
const F = (o: Record<string, unknown>) => ({ enabled: true, ...o } as any);
afterEach(() => { formFields = []; mock.restoreAll(); });

test("hasCapturedPhoto", async () => {
  const { hasCapturedPhoto } = await load();
  assert.equal(hasCapturedPhoto("http://x"), true);
  assert.equal(hasCapturedPhoto("  "), false);
  assert.equal(hasCapturedPhoto(null), false);
});
test("hasCompleteRequiredData: school needs name+class, institute name only", async () => {
  const { hasCompleteRequiredData } = await load();
  assert.equal(hasCompleteRequiredData({ studentName: "A", classSection: "5A", institute: false }), true);
  assert.equal(hasCompleteRequiredData({ studentName: "A", classSection: "", institute: false }), false);
  assert.equal(hasCompleteRequiredData({ studentName: "A", classSection: "", institute: true }), true);
  assert.equal(hasCompleteRequiredData({ studentName: "", classSection: "5A", institute: false }), false);
});
test("isNonDataField: photo/signature are not data", async () => {
  const { isNonDataField } = await load();
  for (const k of ["photo", "photo_id", "signature", "signature_upload"]) assert.equal(isNonDataField({ key: k }), true, k);
  assert.equal(isNonDataField({ key: "fld_0", label: "Signature Image" }), true);
  assert.equal(isNonDataField({ key: "fld_1", label: "Photo No" }), true);
  assert.equal(isNonDataField({ key: "fld_2", label: "Photo URL" }), false);
  assert.equal(isNonDataField({ key: "fld_3", label: "Name" }), false);
  assert.equal(isNonDataField({ key: "fld_4", label: "" }), false);
});
test("requiredDataFields: only enabled, visible, data, required!==false", async () => {
  const { requiredDataFields } = await load();
  const fields = [
    F({ key: "a", label: "Name" }),
    F({ key: "b", label: "Blood", required: false }),  // optional -> excluded
    F({ key: "c", label: "Photo No" }),                // non-data -> excluded
    F({ key: "d", label: "Addr", enabled: false }),    // disabled -> excluded
    F({ key: "e", label: "Class" }),
  ];
  const out = requiredDataFields(fields, { e: false }); // e hidden -> excluded
  assert.deepEqual(out.map((f) => f.key), ["a"]);
});
test("hasAllRequiredFieldData: all-optional config => complete", async () => {
  const { hasAllRequiredFieldData } = await load();
  const fields = [F({ key: "a", label: "Name", required: false })];
  assert.equal(hasAllRequiredFieldData({ extra_fields: {} }, fields, null, false), true);
});
test("hasAllRequiredFieldData: no config falls back to name/class", async () => {
  const { hasAllRequiredFieldData } = await load();
  assert.equal(hasAllRequiredFieldData({ student_name: "A", class_section: "5A" }, [], null, false), true);
  assert.equal(hasAllRequiredFieldData({ student_name: "", class_section: "5A" }, [], null, false), false);
});
test("hasAllRequiredFieldData: required field empty => incomplete", async () => {
  const { hasAllRequiredFieldData } = await load();
  const fields = [F({ key: "fld_0", label: "Name" })];
  assert.equal(hasAllRequiredFieldData({ extra_fields: { fld_0: "Asha" } }, fields, null, false), true);
  assert.equal(hasAllRequiredFieldData({ extra_fields: { fld_0: "" } }, fields, null, false), false);
});
test("matchesExportScope", async () => {
  const { matchesExportScope } = await load();
  const ctx = { fields: [F({ key: "fld_0", label: "Name" })], visibility: {}, institute: false };
  const withPhoto = { photo_url: "u", extra_fields: { fld_0: "A" } };
  const noPhotoNoData = { photo_url: "", extra_fields: { fld_0: "" } };
  assert.equal(matchesExportScope(withPhoto, "captured", ctx), true);
  assert.equal(matchesExportScope(noPhotoNoData, "pending", ctx), true);
  assert.equal(matchesExportScope(noPhotoNoData, "uncaptured", ctx), true);
  assert.equal(matchesExportScope(withPhoto, "captured-pending-data", ctx), false);
  assert.equal(matchesExportScope(noPhotoNoData, "uncaptured-pending-data", ctx), true);
  assert.equal(matchesExportScope(noPhotoNoData, "pending-data", ctx), true);
  assert.equal(matchesExportScope(withPhoto, "all", ctx), true);
});
test("excelScopeClause", async () => {
  const { excelScopeClause } = await load();
  assert.match(excelScopeClause("pending", false), /NOT \(photo_url/);
  assert.match(excelScopeClause("captured", false), /AND \(photo_url/);
  assert.equal(excelScopeClause("all", false), "");
});
test("requestedIdentityChange", async () => {
  const { requestedIdentityChange } = await load();
  assert.equal(requestedIdentityChange({ photo_id: "P2" }, "P1"), true);
  assert.equal(requestedIdentityChange({ photoId: "P1" }, "P1"), false);
  assert.equal(requestedIdentityChange({ extra_fields: { photo_id: "P9" } }, "P1"), true);
  assert.equal(requestedIdentityChange({}, "P1"), false);
});
test("sanitizeFieldVisibility", async () => {
  const { sanitizeFieldVisibility } = await load();
  assert.deepEqual(sanitizeFieldVisibility({ fld_0: true, "bad key!": true, fld_1: false }, false), { fld_0: true, fld_1: false });
  assert.throws(() => sanitizeFieldVisibility("x", false), /must be an object/);
  assert.throws(() => sanitizeFieldVisibility({ fld_0: "yes" }, false), /true or false/);
});
test("collectRecordFacets: classes/groups/dates, counted once", async () => {
  const { collectRecordFacets } = await load();
  const rows = [
    { class_section: "5A", extra_fields: { fld_1: "Science", fld_0: "5A" }, field_labels: { fld_1: "Group", fld_0: "Class" }, photo_url: "u", photo_captured_at: "2026-01-01T00:00:00Z", pending_data: false },
    { class_section: "5A", extra_fields: {}, field_labels: {}, photo_url: "", pending_data: true },
  ];
  const facets = collectRecordFacets("fld_1", rows);
  const cls = facets.classes.find((c) => c.name === "5A")!;
  assert.equal(cls.total, 2);
  assert.equal(cls.count, 1);         // one has a photo
  assert.equal(cls.pendingData, 1);
  assert.equal(facets.groups.find((g) => g.name === "Science")!.count, 1);
  assert.equal(facets.captureDates.length, 1);
});
test("extraFieldByKey / extraFieldValue", async () => {
  const { extraFieldByKey, extraFieldValue } = await load();
  assert.equal(extraFieldByKey({ class_section: " 5A " }, "class_section"), "5A");
  assert.equal(extraFieldByKey({ extra_fields: { fld_0: " v " } }, "fld_0"), "v");
  assert.equal(extraFieldByKey({ extra_fields: {} }, "fld_9"), null);
  assert.equal(extraFieldValue({ extra_fields: { fld_0: "Mgr" }, field_labels: { fld_0: "Designation" } }, "designation"), "Mgr");
  assert.equal(extraFieldValue({ extra_fields: {}, field_labels: {} }, "group"), null);
});
test("loadRequiredDataContext + withPendingFlags (DB mocked)", async () => {
  formFields = [F({ key: "fld_0", label: "Name" })];
  const { withPendingFlags, loadRequiredDataContext } = await load();
  mock.method(pool, "query", async () => ({ rows: [{ field_visibility: { fld_0: true } }] }) as any);
  const ctx = await loadRequiredDataContext("s1", null);
  assert.equal(ctx.institute, false);
  assert.deepEqual(ctx.fields.map((f: any) => f.key), ["fld_0"]);
  const out = await withPendingFlags([{ id: "1", school_id: "s1", institute_id: null, photo_url: "u", extra_fields: { fld_0: "Asha" } } as any]);
  assert.equal(out[0].pending_photo, false);
  assert.equal(out[0].pending_data, false);
  assert.equal(out[0].fully_captured, true);
});

test("loadRequiredDataContext: institute branch", async () => {
  formFields = [F({ key: "fld_0", label: "Name" })];
  const { loadRequiredDataContext } = await load();
  mock.method(pool, "query", async (sql: string) => { assert.match(sql, /FROM institutes/); return { rows: [{ field_visibility: { fld_0: false } }] } as any; });
  const ctx = await loadRequiredDataContext(null, "i1");
  assert.equal(ctx.institute, true);
  assert.equal(ctx.visibility.fld_0, false);
});
test("orgAllowsNumberEdit / orgAllowsRecordEdit", async () => {
  const { orgAllowsNumberEdit, orgAllowsRecordEdit } = await load();
  mock.method(pool, "query", async () => ({ rows: [{ allow: false }] }) as any);
  assert.equal(await orgAllowsNumberEdit(null, "i1"), false);
  assert.equal(await orgAllowsRecordEdit("s1", null), false);
  mock.method(pool, "query", async () => ({ rows: [{ allow: true }] }) as any);
  assert.equal(await orgAllowsNumberEdit("s1", null), true);
  assert.equal(await orgAllowsRecordEdit(null, "i1"), true);
  assert.equal(await orgAllowsNumberEdit(null, null), true); // no org -> default allow
  assert.equal(await orgAllowsRecordEdit(null, null), true);
});
test("assertRecordEditAllowed: complete+locked throws, incomplete passes", async () => {
  formFields = [F({ key: "fld_0", label: "Name" })];
  const { assertRecordEditAllowed } = await load();
  // complete record, editing off -> throws
  let n = 0;
  mock.method(pool, "query", async () => (n++ === 0 ? { rows: [{ field_visibility: {} }] } : { rows: [{ allow: false }] }) as any);
  await assert.rejects(() => assertRecordEditAllowed("s1", null, { studentName: "A", classSection: "5A", institute: false, record: { extra_fields: { fld_0: "A" } } }), /turned off/);
  // incomplete record -> allowed (returns early)
  mock.method(pool, "query", async () => ({ rows: [{ field_visibility: {} }] }) as any);
  await assert.doesNotReject(() => assertRecordEditAllowed("s1", null, { studentName: "", classSection: "", institute: false, record: { extra_fields: { fld_0: "" } } }));
});
test("assertNumberEditAllowed: no change returns; change+locked throws", async () => {
  const { assertNumberEditAllowed } = await load();
  await assert.doesNotReject(() => assertNumberEditAllowed("s1", null, { photo_id: "P1" }, "P1"));
  mock.method(pool, "query", async () => ({ rows: [{ allow: false }] }) as any);
  await assert.rejects(() => assertNumberEditAllowed("s1", null, { photo_id: "P2" }, "P1"), /turned off/);
});
test("withPendingFlags: unifies a generated photo id and schedules persist", async () => {
  formFields = [];
  const { withPendingFlags } = await load();
  mock.method(pool, "query", async () => ({ rows: [{ field_visibility: {} }] }) as any);
  const out = await withPendingFlags([
    { id: "1", school_id: "s1", institute_id: null, photo_url: "", photo_id: "ADD_5", extra_fields: { fld_0: "P42" }, field_labels: { fld_0: "Photo Number" }, student_name: "A", class_section: "5A" } as any,
  ]);
  assert.equal(out[0].photo_id, "P42");
  assert.equal(out[0].pending_photo, true);
});

test("assertRecordEditAllowed: builds record from name/class when none given", async () => {
  formFields = [];
  const { assertRecordEditAllowed } = await load();
  mock.method(pool, "query", async () => ({ rows: [{ field_visibility: {}, allow: false }] }) as any);
  // complete (name+class), editing off -> throws, using the synthesized record
  await assert.rejects(() => assertRecordEditAllowed("s1", null, { studentName: "A", classSection: "5A", institute: false }), /turned off/);
});
