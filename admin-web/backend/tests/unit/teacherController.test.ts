import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres, storageStub } from "../helpers/testkit.ts";

let formFields: any[] = [];
beforeEach(() => {
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/controllers/formConfigController.ts", { namedExports: { loadFormConfigForOrg: async () => formFields } });
});
afterEach(() => { formFields = []; mock.restoreAll(); });
const load = () => import("../../src/controllers/teacherController.ts");
const teacher = { userId: "u1", role: "teacher", schoolId: "s1", assignedClass: "5", assignedSection: "A" };
const wide = { userId: "u1", role: "teacher", schoolId: "s1" };
const inst = { userId: "u2", role: "institute_staff", instituteId: "i1" };
const studentRow = (o: Record<string, unknown> = {}) => ({ id: "st1", school_id: "s1", institute_id: null, class_section: "5 A", student_name: "Asha", photo_id: "P1", photo_url: null, extra_fields: {}, field_labels: {}, app_visible: true, ...o });

test("getTeacherFormConfig: auth + success", async () => {
  const { getTeacherFormConfig } = await load();
  let c = reqres({ user: undefined });
  await getTeacherFormConfig(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/);
  formFields = [{ key: "student_name", label: "Name", enabled: true }];
  route([[/FROM form_configs/i, [{ updated_at: new Date().toISOString() }]]]);
  c = reqres({ user: teacher });
  await getTeacherFormConfig(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.ok(Array.isArray(c.res.body.fields));
});
test("listTeacherStudents: school (class-scoped) + wide + institute + group", async () => {
  const { listTeacherStudents } = await load();
  route([[/FROM students/i, [studentRow()]]]);
  let c = reqres({ user: teacher, query: {} });
  await listTeacherStudents(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
  c = reqres({ user: wide, query: {} });
  await listTeacherStudents(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
  c = reqres({ user: inst, query: {} });
  await listTeacherStudents(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
  formFields = [{ key: "class_section", label: "Class", enabled: true }];
  c = reqres({ user: wide, query: { groupValue: "5 A" } });
  await listTeacherStudents(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("getTeacherStudent: id / not found / belongs-guard / success", async () => {
  const { getTeacherStudent } = await load();
  let c = reqres({ user: teacher, params: {} });
  await getTeacherStudent(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([[/FROM students WHERE id = \$1 LIMIT 1/i, []]]);
  c = reqres({ user: teacher, params: { id: "st1" } });
  await getTeacherStudent(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([[/FROM students WHERE id = \$1 LIMIT 1/i, [studentRow({ school_id: "other" })]]]);
  c = reqres({ user: teacher, params: { id: "st1" } });
  await getTeacherStudent(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /another school/);
  route([[/FROM students WHERE id = \$1 LIMIT 1/i, [studentRow()]]]);
  c = reqres({ user: teacher, params: { id: "st1" } });
  await getTeacherStudent(c.req, c.res, c.next); assert.equal(c.res.body.student.id, "st1");
});
test("getTeacherProgress: institute + school", async () => {
  const { getTeacherProgress } = await load();
  route([[/FROM students/i, [{ total_students: "10", captured: "6", uncaptured: "4" }]]]);
  let c = reqres({ user: inst });
  await getTeacherProgress(c.req, c.res, c.next); assert.equal(c.res.body.totalStudents, 10);
  c = reqres({ user: teacher });
  await getTeacherProgress(c.req, c.res, c.next); assert.equal(c.res.body.captured, 6);
});
test("getTeacherHome: school + institute", async () => {
  const { getTeacherHome } = await load();
  formFields = [{ key: "class_section", label: "Class", enabled: true }];
  route([[/FROM schools WHERE id/i, [{ name: "Zed", logo_url: null }]], [/GROUP BY/i, [{ group_value: "5 A", total_students: "3", captured: "2", uncaptured: "1" }]]]);
  let c = reqres({ user: wide });
  await getTeacherHome(c.req, c.res, c.next);
  assert.equal(c.res.body.schoolName, "Zed"); assert.equal(c.res.body.overall.totalStudents, 3);
  formFields = [{ key: "fld_0", label: "Designation", enabled: true }];
  route([[/FROM institutes WHERE id/i, [{ name: "Inst", logo_url: null }]], [/GROUP BY/i, [{ group_value: "Teacher", total_students: "2", captured: "1", uncaptured: "1" }]]]);
  c = reqres({ user: inst });
  await getTeacherHome(c.req, c.res, c.next); assert.equal(c.res.body.orgType, "institute");
});
test("listTeacherModels: no owner + success", async () => {
  const { listTeacherModels } = await load();
  route([[/owner_admin_id FROM schools/i, [{ owner_admin_id: null }]]]);
  let c = reqres({ user: wide });
  await listTeacherModels(c.req, c.res, c.next); assert.equal(c.res.body.count, 0);
  route([[/owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/kind = 'model'/i, [{ id: "m1" }]], [/kind = 'tag'/i, [{ id: "t1" }]]]);
  c = reqres({ user: wide });
  await listTeacherModels(c.req, c.res, c.next); assert.equal(c.res.body.count, 2);
});

test("createTeacherStudent: auth / name / class / success (school + institute)", async () => {
  const { createTeacherStudent } = await load();
  let c = reqres({ user: undefined, body: {} });
  await createTeacherStudent(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/);
  route([]);
  c = reqres({ user: teacher, body: {} });
  await createTeacherStudent(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Name is required/);
  c = reqres({ user: wide, body: { student_name: "Asha" } });
  await createTeacherStudent(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Class \/ section is required/);
  // school success (photo id provided -> no allocation)
  route([[/SELECT 1 FROM students/i, []], [/INSERT INTO students/i, [studentRow()]]]);
  c = reqres({ user: teacher, body: { student_name: "Asha", class_section: "5 A", photo_id: "P1" } });
  await createTeacherStudent(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201); assert.equal(c.res.body.student.id, "st1");
  // institute success (class defaults to ALL)
  route([[/SELECT 1 FROM students/i, []], [/INSERT INTO students/i, [studentRow({ institute_id: "i1", school_id: null })]]]);
  c = reqres({ user: inst, body: { student_name: "Member", photo_id: "P2" } });
  await createTeacherStudent(c.req, c.res, c.next); assert.equal(c.res.code, 201);
});
