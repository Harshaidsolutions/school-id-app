import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient, storageStub } from "../helpers/testkit.ts";

let mailDelivered = true;
beforeEach(() => {
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/utils/email.ts", { namedExports: { sendEmail: async () => ({ delivered: mailDelivered, smtpConfigured: mailDelivered }) } });
  mock.module("../../src/utils/adminOtp.ts", { namedExports: { requestAdminActionOtp: async () => ({ emailDelivery: "sent", message: "sent" }), verifyAdminActionOtp: async () => {} } });
  mock.module("../../src/controllers/formConfigController.ts", { namedExports: { seedDefaultFormConfig: async () => {} } });
});
afterEach(() => { mailDelivered = true; delete process.env.NODE_ENV; mock.restoreAll(); });
const load = () => import("../../src/controllers/schoolController.ts");
const admin = { userId: "a1", role: "admin" };
const scope: any = [/is_active = true LIMIT 1/i, [{ is_super_admin: true }]];

test("createSchool: name required + success", async () => {
  const { createSchool } = await load();
  route([scope]);
  let c = reqres({ user: admin, body: {} });
  await createSchool(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /School name is required/);
  route([scope, [/INSERT INTO schools/i, [{ id: "s1", name: "Zed" }]]]);
  c = reqres({ user: admin, body: { name: "Zed" } });
  await createSchool(c.req, c.res, c.next); assert.equal(c.res.code, 201); assert.equal(c.res.body.school.name, "Zed");
});
test("createSchoolWithOwner: validations + success", async () => {
  const { createSchoolWithOwner } = await load();
  mock.method(pool, "connect", async () => fakeClient([scope]));
  const run = async (body: Record<string, unknown>) => { const c = reqres({ user: admin, body }); await createSchoolWithOwner(c.req, c.res, c.next); return c; };
  assert.match(String(((await run({})).getErr() as Error).message), /School name is required/);
  assert.match(String(((await run({ schoolName: "S" })).getErr() as Error).message), /Owner name is required/);
  assert.match(String(((await run({ schoolName: "S", ownerName: "O" })).getErr() as Error).message), /Password is required/);
  assert.match(String(((await run({ schoolName: "S", ownerName: "O", password: "p", confirmPassword: "q" })).getErr() as Error).message), /do not match/);
  mock.method(pool, "connect", async () => fakeClient([
    [/FROM (schools|institutes|organizations)[\s\S]*owner_username_plain/i, []],
    [/SELECT 1 FROM users WHERE lower\(email\)/i, []],
    [/INSERT INTO schools/i, [{ id: "s1", name: "S" }]],
    [/INSERT INTO users/i, []],
    [/BEGIN|COMMIT/i, []],
  ]));
  route([scope]);
  const c = await run({ schoolName: "S", ownerName: "owner", password: "password1" });
  assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201);
});
test("listSchools", async () => {
  const { listSchools } = await load();
  route([scope, [/FROM schools s/i, [{ id: "s1" }]]]);
  const c = reqres({ user: admin, query: {} });
  await listSchools(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("updateSchool: id / not found / success", async () => {
  const { updateSchool } = await load();
  route([scope]);
  let c = reqres({ user: admin, params: {} });
  await updateSchool(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([scope, [/SELECT \* FROM schools WHERE id/i, []]]);
  c = reqres({ user: admin, params: { id: "s1" }, body: {} });
  await updateSchool(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /School not found/);
  route([scope, [/SELECT \* FROM schools WHERE id/i, [{ id: "s1", name: "Old" }]], [/UPDATE schools/i, [{ id: "s1", name: "Old" }]]]);
  c = reqres({ user: admin, params: { id: "s1" }, body: { phone: "999" } });
  await updateSchool(c.req, c.res, c.next); assert.equal(c.res.body.school.id, "s1");
});
test("setSchoolActive + setSchoolCapturePolicy", async () => {
  const { setSchoolActive, setSchoolCapturePolicy } = await load();
  let c = reqres({ user: admin, params: { id: "s1" }, body: {} });
  await setSchoolActive(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /is_active is required/);
  route([[/UPDATE schools/i, [{ id: "s1", is_active: false }]]]);
  c = reqres({ user: admin, params: { id: "s1" }, body: { is_active: false } });
  await setSchoolActive(c.req, c.res, c.next); assert.equal(c.res.body.school.is_active, false);
  route([scope, [/UPDATE schools/i, [{ id: "s1" }]]]);
  c = reqres({ user: admin, params: { id: "s1" }, body: { allow_screenshot: true, allow_screen_recording: true } });
  await setSchoolCapturePolicy(c.req, c.res, c.next); assert.equal(c.res.body.school.id, "s1");
});
test("requestSchoolDeleteOtp: not found + success + dev otp", async () => {
  const { requestSchoolDeleteOtp } = await load();
  route([[/SELECT id, name FROM schools/i, []]]);
  let c = reqres({ user: admin, params: { id: "s1" } });
  await requestSchoolDeleteOtp(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /School not found/);
  route([[/SELECT id, name FROM schools/i, [{ id: "s1", name: "S" }]], [/id, email FROM users/i, [{ id: "a1", email: "a@b.com" }]], [/UPDATE school_delete_otps|INSERT INTO school_delete_otps/i, []]]);
  c = reqres({ user: admin, params: { id: "s1" } });
  await requestSchoolDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.emailDelivery, "sent");
});
test("deleteSchool: bad otp + success", async () => {
  const { deleteSchool } = await load();
  let c = reqres({ user: admin, params: { id: "s1" }, body: { otp: "bad" } });
  await deleteSchool(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /6-digit code/);
  const hash = await bcrypt.hash("123456", 10);
  mock.method(pool, "connect", async () => fakeClient([
    [/SELECT id, name FROM schools[\s\S]*FOR UPDATE/i, [{ id: "s1", name: "S" }]],
    [/FROM school_delete_otps/i, [{ id: "o1", otp_hash: hash, expires_at: new Date(Date.now() + 60000) }]],
    [/BEGIN|COMMIT|UPDATE|DELETE/i, []],
  ]));
  c = reqres({ user: admin, params: { id: "s1" }, body: { otp: "123456" } });
  await deleteSchool(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});
test("requestSchoolBulkDeleteOtp + bulkDeleteSchools", async () => {
  const { requestSchoolBulkDeleteOtp, bulkDeleteSchools } = await load();
  const UUID = "11111111-1111-4111-8111-111111111111";
  route([scope, [/FROM schools WHERE id = \$1 AND owner_admin_id/i, [{ id: UUID }]], [/SELECT id FROM schools WHERE id = ANY/i, [{ id: UUID }]], [/email FROM users WHERE id/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, body: { ids: [UUID] } });
  await requestSchoolBulkDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, owner_admin_id FROM schools WHERE id = ANY/i, [{ id: UUID, owner_admin_id: "a1" }]], [/DELETE FROM schools WHERE id = ANY[\s\S]*RETURNING/i, [{ id: UUID }]], [/BEGIN|COMMIT|DELETE|UPDATE/i, []]]));
  route([scope, [/FROM schools WHERE id = \$1 AND owner_admin_id/i, [{ id: UUID }]], [/SELECT id FROM schools WHERE id = ANY/i, [{ id: UUID }]]]);
  c = reqres({ user: admin, body: { ids: [UUID], otp: "123456" } });
  await bulkDeleteSchools(c.req, c.res, c.next); assert.deepEqual(c.res.body.deleted, [UUID]);
});
