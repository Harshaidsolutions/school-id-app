import { test } from "node:test";
import assert from "node:assert/strict";
import { getAcademicYearStartYear, formatAcademicYearLabel, buildCurrentAcademicYearOption, buildDashboardAcademicYearOptions } from "../../src/utils/academicYear.ts";
import { captureDayKey } from "../../src/utils/captureDay.ts";
import { cleanPhone, isPhone, isEmail, isPhoneField, isEmailField, fieldProblem, phoneError, emailError } from "../../src/utils/validate.ts";
import { sequentialUploadProgressLabel } from "../../src/utils/sequentialUploadProgress.ts";
import { formatCalendarDate } from "../../src/utils/formatCalendarDate.ts";
import { parseCalendarYmd, calendarDaysFromCreated } from "../../src/utils/calendarDays.ts";
import { organizationCategoryFields, isSignatureLabel, isPhotoNumberLabel } from "../../src/utils/organizationGroups.ts";

test("academicYear: April boundary", () => {
  assert.equal(getAcademicYearStartYear(new Date("2026-04-01T00:00:00Z")), 2026);
  assert.equal(getAcademicYearStartYear(new Date("2026-03-31T00:00:00Z")), 2025);
  assert.equal(formatAcademicYearLabel(2026), "2026 - 2027");
  assert.deepEqual(buildCurrentAcademicYearOption(new Date("2026-05-01T00:00:00Z")), { label: "2026 - 2027", value: "2026" });
  assert.equal(buildDashboardAcademicYearOptions(new Date("2026-05-01T00:00:00Z")).length, 1);
});
test("captureDayKey", () => {
  assert.equal(captureDayKey(null), null);
  assert.equal(captureDayKey("bad"), null);
  assert.match(captureDayKey("2026-01-01T00:00:00Z") as string, /^\d{4}-\d{2}-\d{2}$/);
});
test("validate: phone", () => {
  assert.equal(cleanPhone("+91 98765 43210"), "9876543210");
  assert.equal(cleanPhone("098765 43210"), "9876543210");
  assert.equal(isPhone("9876543210"), true);
  assert.equal(isPhone("1234567890"), false); // must start 6-9
});
test("validate: email", () => {
  assert.equal(isEmail("a@b.com"), true);
  assert.equal(isEmail("bad"), false);
});
test("validate: field detection + problems", () => {
  assert.equal(isPhoneField("parent_phone", "x"), true);
  assert.equal(isPhoneField("fld_0", "Mobile Number"), true);
  assert.equal(isEmailField("fld_1", "Email ID"), true);
  assert.equal(fieldProblem("fld_0", "Mobile", "123"), "Mobile: enter a valid 10-digit mobile number");
  assert.equal(fieldProblem("fld_0", "Mobile", "9876543210"), null);
  assert.equal(fieldProblem("fld_1", "Email", "bad"), "Email: enter a valid email address");
  assert.equal(fieldProblem("fld_2", "Name", "Asha"), null);
  assert.equal(fieldProblem("fld_0", "Mobile", "—"), null);
});
test("validate: phoneError / emailError", () => {
  assert.equal(phoneError("", false), null);
  assert.equal(phoneError("", true), "Phone number is required.");
  assert.equal(phoneError("9876543210"), null);
  assert.match(phoneError("12") as string, /valid 10-digit/);
  assert.equal(emailError("", true), "Email is required.");
  assert.equal(emailError("a@b.com"), null);
});
test("sequentialUploadProgressLabel", () => {
  assert.equal(sequentialUploadProgressLabel(1, 3, "a.png"), "Uploading 1/3: a.png");
});
test("formatCalendarDate", () => {
  assert.equal(formatCalendarDate(""), "—");
  assert.equal(formatCalendarDate("not-a-date"), "—");
  assert.match(formatCalendarDate("2026-01-02T10:00:00Z"), /2 Jan 2026/);
});
test("calendarDays", () => {
  assert.deepEqual(parseCalendarYmd("2026-01-02T00:00:00Z"), { y: 2026, m: 1, d: 2 });
  assert.equal(parseCalendarYmd(""), null);
  const days = calendarDaysFromCreated("2026-01-01", new Date("2026-01-03T00:00:00Z"));
  assert.deepEqual(days, ["2026-01-03", "2026-01-02", "2026-01-01"]);
  assert.deepEqual(calendarDaysFromCreated(null), []);
});
test("organizationGroups", () => {
  assert.deepEqual(organizationCategoryFields([{ id: "f1", field_name: "House", field_type: "dropdown", is_group: true }]), [{ kind: "group", key: "f1", label: "House" }]);
  assert.ok(Array.isArray(organizationCategoryFields([{ id: "f2", field_name: "Class", field_type: "text" }])));
  assert.equal(isSignatureLabel("Signature Upload"), true);
  assert.equal(isPhotoNumberLabel("Photo Number"), true);
  assert.equal(isPhotoNumberLabel("Name"), false);
});
