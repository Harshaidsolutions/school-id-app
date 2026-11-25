import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInstituteStaff, getTeacherOrgKind, getTeacherOrgId, assertStudentBelongsToOrg,
} from "../../src/utils/teacherOrgScope.ts";

test("isInstituteStaff / getTeacherOrgKind", () => {
  assert.equal(isInstituteStaff({ role: "institute_staff", instituteId: "i1" } as any), true);
  assert.equal(isInstituteStaff({ role: "institute_staff" } as any), false);
  assert.equal(getTeacherOrgKind({ role: "institute_staff", instituteId: "i1" } as any), "institute");
  assert.equal(getTeacherOrgKind({ role: "teacher", schoolId: "s1" } as any), "school");
});
test("getTeacherOrgId: organization_staff", () => {
  assert.equal(getTeacherOrgId({ role: "organization_staff", organizationId: "o1" } as any), "o1");
  assert.throws(() => getTeacherOrgId({ role: "organization_staff" } as any), /organization/);
});
test("getTeacherOrgId: institute + school", () => {
  assert.equal(getTeacherOrgId({ role: "institute_staff", instituteId: "i1" } as any), "i1");
  // institute_staff without an instituteId is not institute staff, so it hits the school branch
  assert.throws(() => getTeacherOrgId({ role: "institute_staff" } as any), /school/);
  assert.equal(getTeacherOrgId({ role: "teacher", schoolId: "s1" } as any), "s1");
  assert.throws(() => getTeacherOrgId({ role: "teacher" } as any), /school/);
});
test("assertStudentBelongsToOrg: hidden, institute mismatch, school mismatch, ok", () => {
  assert.throws(() => assertStudentBelongsToOrg({ role: "teacher", schoolId: "s1" } as any, { app_visible: false }), /hidden/);
  assert.throws(() => assertStudentBelongsToOrg({ role: "institute_staff", instituteId: "i1" } as any, { institute_id: "i2" }), /another institute/);
  assert.doesNotThrow(() => assertStudentBelongsToOrg({ role: "institute_staff", instituteId: "i1" } as any, { institute_id: "i1" }));
  assert.throws(() => assertStudentBelongsToOrg({ role: "teacher", schoolId: "s1" } as any, { school_id: "s2" }), /another school/);
  assert.doesNotThrow(() => assertStudentBelongsToOrg({ role: "teacher", schoolId: "s1" } as any, { school_id: "s1" }));
});
