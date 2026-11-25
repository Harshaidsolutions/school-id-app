import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combineClassSection, normalizeClassSection, isSchoolWideTeacher, getTeacherAssignedClassSection,
  assertTeacherScope, getTeacherDataFilter, getTeacherSchoolId, resolveClassSectionQuery,
} from "../../src/utils/teacherScope.ts";

const teacher = (o: Record<string, unknown> = {}) => ({ role: "teacher", schoolId: "s1", assignedClass: "5", assignedSection: "A", ...o } as any);

test("combineClassSection", () => {
  assert.equal(combineClassSection("5", "A"), "5 A");
  assert.equal(combineClassSection("5", ""), "5");
  assert.equal(combineClassSection("", "A"), "A");
  assert.equal(combineClassSection(null, null), "");
});
test("normalizeClassSection", () => assert.equal(normalizeClassSection("  5 A "), "5 a"));
test("isSchoolWideTeacher", () => {
  assert.equal(isSchoolWideTeacher(teacher({ assignedClass: null })), true);
  assert.equal(isSchoolWideTeacher(teacher()), false);
  assert.equal(isSchoolWideTeacher({ role: "admin" } as any), false);
});
test("getTeacherAssignedClassSection", () => assert.equal(getTeacherAssignedClassSection(teacher()), "5 A"));

test("assertTeacherScope: non-teacher is a no-op", () => {
  assert.doesNotThrow(() => assertTeacherScope({ role: "admin" } as any, { schoolId: "x", classSection: "y" }));
});
test("assertTeacherScope: missing school / wrong school / wrong class", () => {
  assert.throws(() => assertTeacherScope(teacher({ schoolId: null }), { schoolId: "s1", classSection: "5 A" }), /missing school/);
  assert.throws(() => assertTeacherScope(teacher(), { schoolId: "other", classSection: "5 A" }), /your own school/);
  assert.throws(() => assertTeacherScope(teacher(), { schoolId: "s1", classSection: "6 B" }), /assigned class/);
});
test("assertTeacherScope: matching class passes; school-wide passes any class", () => {
  assert.doesNotThrow(() => assertTeacherScope(teacher(), { schoolId: "s1", classSection: "5 A" }));
  assert.doesNotThrow(() => assertTeacherScope(teacher({ assignedClass: null }), { schoolId: "s1", classSection: "anything" }));
});
test("assertTeacherScope: empty assignedClass => school-wide, passes any class", () => {
  assert.doesNotThrow(() => assertTeacherScope(teacher({ assignedClass: "", assignedSection: "" }), { schoolId: "s1", classSection: "any" }));
});
test("getTeacherDataFilter", () => {
  assert.deepEqual(getTeacherDataFilter(teacher()), { schoolId: "s1", classSection: "5 A" });
  assert.throws(() => getTeacherDataFilter({ role: "admin" } as any), /teacher accounts/);
  assert.throws(() => getTeacherDataFilter(teacher({ schoolId: null })), /missing school/);
  assert.throws(() => getTeacherDataFilter(teacher({ assignedClass: "", assignedSection: "" })), /class or section/);
});
test("getTeacherSchoolId", () => {
  assert.equal(getTeacherSchoolId(teacher()), "s1");
  assert.throws(() => getTeacherSchoolId({ role: "admin" } as any), /teacher accounts/);
  assert.throws(() => getTeacherSchoolId(teacher({ schoolId: null })), /missing school/);
});
test("resolveClassSectionQuery precedence", () => {
  assert.equal(resolveClassSectionQuery({ classSection: " 5 A " }), "5 A");
  assert.equal(resolveClassSectionQuery({ class_section: " 6 B " }), "6 B");
  assert.equal(resolveClassSectionQuery({ class: "7", section: "C" }), "7 C");
  assert.equal(resolveClassSectionQuery({}), "");
});
