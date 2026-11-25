import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPhone, isPhone, isEmail, fieldProblem, phoneError, emailError } from "../../src/lib/validate.ts";
import { fmtDate, fmtDateTime, dayKey, dayLabel, initials, pct, num, academicYear, waLink } from "../../src/lib/format.ts";
import { isExcelFormField, sortFormFields, formFieldRowId, isPhotoExcelField } from "../../src/shared/formFields.ts";
import { niceLabel, allValuesLabel, isClassCategoryField, isBloodGroupField, configuredCategoryFields } from "../../src/shared/formFieldHelpers.ts";

const F = (o: Record<string, unknown>) => ({ enabled: true, ...o } as any);

test("validate (phone/email/field)", () => {
  assert.equal(cleanPhone("+91 98765 43210"), "9876543210");
  assert.equal(isPhone("9876543210"), true);
  assert.equal(isEmail("a@b.com"), true);
  assert.match(fieldProblem("fld_0", "Mobile", "12") as string, /10-digit/);
  assert.equal(phoneError("", true), "Phone number is required.");
  assert.equal(emailError("a@b.com"), null);
});
test("format: dates in IST", () => {
  assert.equal(fmtDate(null), "—");
  assert.match(fmtDate("2026-10-30T00:00:00Z"), /^\d{2}-\d{2}-\d{4}$/);
  assert.match(fmtDateTime("2026-10-30T10:45:00Z"), /2026,/);
  assert.match(dayKey("2026-10-30T00:00:00Z") as string, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dayKey("bad"), null);
  assert.equal(dayLabel("2026-10-30"), "30-10-2026");
});
test("format: initials/pct/num/academicYear/waLink", () => {
  assert.equal(initials("Asha Kumari"), "AK");
  assert.equal(initials(""), "?");
  assert.equal(pct(0, 0), "0%");
  assert.equal(pct(1, 2), "50%");
  assert.equal(num(12345), "12,345");
  assert.deepEqual(academicYear(new Date("2026-05-01T00:00:00Z")), { value: "2026", label: "2026 - 2027" });
  assert.match(waLink("9876543210", "hi"), /wa\.me\/919876543210\?text=hi/);
});
test("shared formFields", () => {
  assert.equal(isExcelFormField(F({ key: "fld_0", label: "X" })), true);
  assert.deepEqual(sortFormFields([F({ key: "b", label: "B", displayOrder: 2 }), F({ key: "a", label: "A", displayOrder: 1 })]).map((f) => f.key), ["a", "b"]);
  assert.equal(formFieldRowId(F({ key: "x", label: "X", colIndex: 3 }), 0), "excel:3:x");
  assert.equal(isPhotoExcelField({ label: "Photo" }), true);
});
test("shared formFieldHelpers", () => {
  assert.equal(niceLabel("CLASS"), "Class");
  assert.equal(allValuesLabel("class"), "All Classes");
  assert.equal(isClassCategoryField(F({ key: "fld_0", label: "Grade" })), true);
  assert.equal(isBloodGroupField(F({ key: "x", label: "Blood Group" })), true);
  assert.deepEqual(configuredCategoryFields([F({ key: "g", label: "House", isGroup: true })]), [{ kind: "group", key: "g", label: "House" }]);
});
