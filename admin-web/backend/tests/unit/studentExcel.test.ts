import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
const BAD = Buffer.from("PK\x03\x04 not a real xlsx");
import {
  cellToString, uniquenessKey, listSheetNames, parseStudentExcel, extractExcelHeaders,
  validateStudentRows, buildExportHeaders, studentFieldValue, inferSchemaFromExcelBuffer,
  inferColumnSchemaFromExcelBuffer, formFieldsFromColumnSchema,
} from "../../src/utils/studentExcel.ts";

function wbBuffer(rows: unknown[][], name = "Sheet1"): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
const F = (o: Record<string, unknown>) => ({ enabled: true, ...o } as any);

test("cellToString", () => {
  assert.equal(cellToString(null), "");
  assert.equal(cellToString(new Date("2026-02-03T00:00:00Z")), "2026-02-03");
  assert.equal(cellToString(42), "42");
  assert.equal(cellToString(1234.5), "1234.5");
  assert.equal(cellToString(Infinity), "");
  assert.equal(cellToString(true), "true");
  assert.equal(cellToString(false), "false");
  assert.equal(cellToString("  hi  "), "hi");
});
test("uniquenessKey normalizes", () => assert.equal(uniquenessKey(" 5 A ", " P1 "), "5 a|p1"));

test("listSheetNames", () => {
  assert.deepEqual(listSheetNames(wbBuffer([["A", "B"]], "Students")), ["Students"]);
  assert.deepEqual(listSheetNames(BAD), []); // unreadable zip -> catch -> []
});

test("parseStudentExcel: title row skipped, meta col dropped, phone stripped, canonical mapped", () => {
  const buf = wbBuffer([
    ["My School Export"],              // title row (1 cell) -> skipped
    ["Name", "Phone", "Status", "Blood Group"],
    ["Asha", "98-76 54", "captured", "O+"],
    ["", "", "", ""],                  // empty row -> skipped
  ]);
  const rows = parseStudentExcel(buf);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentName, "Asha");        // canonical from Name
  assert.equal(rows[0].parentPhone, "987654");      // stripped, canonical from Phone
  assert.equal("fld_2" in rows[0].extraFields, false); // Status is a meta column, dropped
  assert.equal(rows[0].extraFields.fld_3, "O+");
});
test("parseStudentExcel: form config can disable/rename a column", () => {
  const buf = wbBuffer([["Name", "Phone"], ["Asha", "123"]]);
  const rows = parseStudentExcel(buf, [F({ key: "fld_0", label: "Full Name" }), F({ key: "fld_1", label: "Phone", enabled: false })]);
  assert.equal("fld_1" in rows[0].extraFields, false); // disabled column removed
  assert.equal(rows[0].extraFields.fld_0, "Asha");
});
test("parseStudentExcel: errors", () => {
  assert.throws(() => parseStudentExcel(BAD), /no readable sheet/);
  assert.throws(() => parseStudentExcel(wbBuffer([[]])), /empty|no column headers/);
  assert.throws(() => parseStudentExcel(wbBuffer([["Status"], ["Created At"]])), /no column headers/);
});
test("parseStudentExcel: headers-only sheet returns [] (accepted)", () => {
  mock.method(console, "info", () => {});
  const rows = parseStudentExcel(wbBuffer([["Name", "Class"]]));
  assert.deepEqual(rows, []);
  mock.restoreAll();
});
test("extractExcelHeaders", () => {
  assert.deepEqual(extractExcelHeaders(wbBuffer([["Name", "", "Class"]])), ["Name", "Class"]);
  assert.deepEqual(extractExcelHeaders(BAD), []);
});

test("validateStudentRows: phone + duplicates + fallbacks", () => {
  const base = (o: Record<string, unknown>) => ({ excelRow: 0, photoId: "", classSection: "", studentName: "", parentName: "", parentPhone: "", address: null, rollNo: null, dob: null, gender: null, bloodGroup: null, custom1: null, custom2: null, custom3: null, extraFields: {}, ...o } as any);
  const errs = validateStudentRows([
    base({ excelRow: 2, parentPhone: "12ab", photoId: "P1", classSection: "5A" }),
    base({ excelRow: 3, parentPhone: "999", photoId: "P1", classSection: "5A" }), // duplicate
    base({ excelRow: 4, parentPhone: "999", photoId: "P2", classSection: "5A" }),
  ], [F({ key: "parent_phone", label: "Mobile" })]);
  assert.ok(errs.some((e) => e.row === 2 && /Mobile must be numeric/.test(e.reason)));
  assert.ok(errs.some((e) => e.row === 3 && /Duplicate/.test(e.reason)));
  assert.equal(errs.filter((e) => e.row === 4).length, 0);
});
test("validateStudentRows: no photo/class columns => no duplicate checks", () => {
  const base = (o: Record<string, unknown>) => ({ excelRow: 0, photoId: "", classSection: "", studentName: "", parentName: "", parentPhone: "", address: null, rollNo: null, dob: null, gender: null, bloodGroup: null, custom1: null, custom2: null, custom3: null, extraFields: {}, ...o } as any);
  assert.deepEqual(validateStudentRows([base({ excelRow: 2 }), base({ excelRow: 3 })]), []);
});

test("buildExportHeaders: excludes signature, orders, appends STATUS", () => {
  const headers = buildExportHeaders([
    F({ key: "fld_1", label: "B", displayOrder: 1 }),
    F({ key: "fld_0", label: "A", displayOrder: 0 }),
    F({ key: "signature_upload", label: "Sig" }),
    F({ key: "dyn_1", label: "C", colIndex: 2 }),
  ]);
  assert.deepEqual(headers.map((h) => h.label), ["A", "B", "C", "STATUS"]);
  assert.equal(headers.at(-1)!.key, "status");
});
test("studentFieldValue: status mapping + delegation", () => {
  assert.equal(studentFieldValue({ status: "printed" }, "status"), "Printed");
  assert.equal(studentFieldValue({ status: "captured" }, "status"), "Captured");
  assert.equal(studentFieldValue({}, "status"), "Pending");
  assert.equal(studentFieldValue({ blood_group: "A+" } as any, "blood_group"), "A+");
});

test("inferSchemaFromExcelBuffer / inferColumnSchemaFromExcelBuffer / formFieldsFromColumnSchema", () => {
  const buf = wbBuffer([["Name", "Class"], ["Asha", "5A"]]);
  const schema = inferSchemaFromExcelBuffer(buf);
  assert.deepEqual(schema.map((f) => f.key), ["fld_0", "fld_1"]);
  const cols = inferColumnSchemaFromExcelBuffer(buf);
  assert.deepEqual(cols.map((c) => c.colIndex), [0, 1]);
  const ff = formFieldsFromColumnSchema(cols);
  assert.equal(ff[0].enabled, true);
  assert.equal((ff[0] as any).source, "excel");
  assert.deepEqual(inferColumnSchemaFromExcelBuffer(BAD), []);
  assert.deepEqual(inferSchemaFromExcelBuffer(BAD), []);
});
