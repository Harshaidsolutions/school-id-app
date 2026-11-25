import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient, storageStub } from "../helpers/testkit.ts";

beforeEach(() => {
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/utils/adminOtp.ts", { namedExports: { requestAdminActionOtp: async () => ({ emailDelivery: "sent", message: "sent" }), verifyAdminActionOtp: async () => {} } });
  mock.module("../../src/controllers/formConfigController.ts", { namedExports: { loadFormConfigForOrg: async () => [], groupFieldKeyForOrg: async () => null, syncFormConfigFromExcelFields: async () => [] } });
});
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/studentController.ts");
const admin = { userId: "a1", role: "admin" };
const scope: any = [/is_active = true LIMIT 1/i, [{ is_super_admin: true }]];
const vis: any = [/field_visibility\s+FROM (schools|institutes)/i, [{ field_visibility: {} }]];
const UUID = "11111111-1111-4111-8111-111111111111";
const student = (o: Record<string, unknown> = {}) => ({ id: "st1", school_id: "s1", institute_id: null, student_name: "Asha", class_section: "5A", photo_id: "P1", photo_url: "u", extra_fields: {}, field_labels: {}, status: "captured", ...o });

test("listStudentsBySchool: id required + success", async () => {
  const { listStudentsBySchool } = await load();
  route([scope]);
  let c = reqres({ user: admin, params: {} });
  await listStudentsBySchool(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /schoolId is required/);
  route([scope, vis, [/FROM students\s+WHERE/i, [student()]]]);
  c = reqres({ user: admin, params: { schoolId: "s1" }, query: {} });
  await listStudentsBySchool(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("listStudentsAdmin: owner-scoped + photo filter", async () => {
  const { listStudentsAdmin } = await load();
  route([scope, vis, [/FROM students/i, [student(), student({ id: "st2", photo_url: null })]]]);
  let c = reqres({ user: admin, query: {} });
  await listStudentsAdmin(c.req, c.res, c.next); assert.equal(c.res.body.count, 2);
  route([scope, vis, [/FROM students/i, [student(), student({ id: "st2", photo_url: null })]]]);
  c = reqres({ user: admin, query: { photo: "captured" } });
  await listStudentsAdmin(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("createStudentAdmin: name required", async () => {
  const { createStudentAdmin } = await load();
  route([scope]);
  const c = reqres({ user: admin, body: { schoolId: "s1" } });
  await createStudentAdmin(c.req, c.res, c.next); assert.ok(c.getErr() !== "none");
});
test("deleteStudentPhotoAdmin: id / not found / success", async () => {
  const { deleteStudentPhotoAdmin } = await load();
  let c = reqres({ user: admin, params: {} });
  await deleteStudentPhotoAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([[/FROM students WHERE id = \$1 LIMIT 1/i, []]]);
  c = reqres({ user: admin, params: { id: "st1" } });
  await deleteStudentPhotoAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([[/FROM students WHERE id = \$1 LIMIT 1/i, [student()]], scope, [/UPDATE students/i, [student({ photo_url: null })]]]);
  c = reqres({ user: admin, params: { id: "st1" } });
  await deleteStudentPhotoAdmin(c.req, c.res, c.next); assert.equal(c.res.body.student.id, "st1");
});
test("requestStudentDeleteOtp + deleteStudentAdmin", async () => {
  const { requestStudentDeleteOtp, deleteStudentAdmin } = await load();
  route([[/student_name, school_id, institute_id FROM students/i, [{ student_name: "Asha", school_id: "s1", institute_id: null }]], scope, [/email FROM users/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, params: { id: "st1" } });
  await requestStudentDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/FROM students WHERE id = \$1 LIMIT 1 FOR UPDATE/i, [student()]], [/BEGIN|COMMIT|DELETE/i, []]]));
  route([scope]);
  c = reqres({ user: admin, params: { id: "st1" }, body: {} });
  await deleteStudentAdmin(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
test("requestStudentBulkDeleteOtp + bulkDeleteStudents", async () => {
  const { requestStudentBulkDeleteOtp, bulkDeleteStudents } = await load();
  route([scope, [/FROM students WHERE id = ANY/i, [{ id: UUID, school_id: "s1", institute_id: null }]], [/email FROM users/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, body: { ids: [UUID], schoolId: "s1" } });
  await requestStudentBulkDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, school_id, institute_id, photo_url[\s\S]*FOR UPDATE/i, [{ id: UUID, school_id: "s1", institute_id: null, photo_url: null }]], [/DELETE FROM students WHERE id = ANY[\s\S]*RETURNING/i, [{ id: UUID }]], [/BEGIN|COMMIT/i, []]]));
  route([scope, [/FROM students WHERE id = ANY/i, [{ id: UUID, school_id: "s1", institute_id: null }]]]);
  c = reqres({ user: admin, body: { ids: [UUID], schoolId: "s1", otp: "123456" } });
  await bulkDeleteStudents(c.req, c.res, c.next); assert.equal(c.getErr(), "none"); assert.equal(c.res.body.deletedCount, 1);
});
test("requestSchoolExcelDeleteOtp + deleteSchoolExcelData", async () => {
  const { requestSchoolExcelDeleteOtp, deleteSchoolExcelData } = await load();
  route([scope, [/SELECT name FROM schools/i, [{ name: "S" }]], [/email FROM users/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, params: { schoolId: "s1" } });
  await requestSchoolExcelDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, photo_url FROM students/i, [{ id: "st1", photo_url: null }]], [/DELETE FROM students/i, []], [/BEGIN|COMMIT|form_configs|import_batches|UPDATE/i, []]]));
  route([scope]);
  c = reqres({ user: admin, params: { schoolId: "s1" }, body: { otp: "123456" } });
  await deleteSchoolExcelData(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
test("requestSchoolPhotosDeleteOtp + deleteSchoolPhotosData", async () => {
  const { requestSchoolPhotosDeleteOtp, deleteSchoolPhotosData } = await load();
  route([scope, [/SELECT name FROM schools/i, [{ name: "S" }]], [/email FROM users/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, params: { schoolId: "s1" } });
  await requestSchoolPhotosDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, photo_url FROM students WHERE school_id = \$1 AND photo_url/i, [{ id: "st1", photo_url: "u" }]], [/UPDATE students|DELETE|BEGIN|COMMIT/i, []]]));
  route([scope]);
  c = reqres({ user: admin, params: { schoolId: "s1" }, body: { otp: "123456" } });
  await deleteSchoolPhotosData(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});

test("institute excel + photos delete pairs", async () => {
  const { requestInstituteExcelDeleteOtp, deleteInstituteExcelData, requestInstitutePhotosDeleteOtp, deleteInstitutePhotosData } = await load();
  // excel otp
  route([scope, [/SELECT name FROM institutes/i, [{ name: "I" }]], [/email FROM users/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, params: { instituteId: "i1" } });
  await requestInstituteExcelDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  // excel delete
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, photo_url FROM students/i, [{ id: "m1", photo_url: null }]], [/DELETE FROM students|BEGIN|COMMIT|form_configs|import_batches|UPDATE/i, []]]));
  route([scope]);
  c = reqres({ user: admin, params: { instituteId: "i1" }, body: { otp: "123456" } });
  await deleteInstituteExcelData(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  // photos otp
  route([scope, [/SELECT name FROM institutes/i, [{ name: "I" }]], [/email FROM users/i, [{ email: "a@b.com" }]]]);
  c = reqres({ user: admin, params: { instituteId: "i1" } });
  await requestInstitutePhotosDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  // photos delete
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, photo_url FROM students WHERE institute_id = \$1 AND photo_url/i, [{ id: "m1", photo_url: "u" }]], [/UPDATE students|DELETE|BEGIN|COMMIT/i, []]]));
  route([scope]);
  c = reqres({ user: admin, params: { instituteId: "i1" }, body: { otp: "123456" } });
  await deleteInstitutePhotosData(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
