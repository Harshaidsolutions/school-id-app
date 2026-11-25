import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient, storageStub } from "../helpers/testkit.ts";

beforeEach(() => {
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/utils/adminOtp.ts", { namedExports: { requestAdminActionOtp: async () => ({ emailDelivery: "sent", message: "sent" }), verifyAdminActionOtp: async () => {} } });
});
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/adminUserController.ts");
const admin = { userId: "a1", role: "admin" };
const scope: any = [/is_active = true LIMIT 1/i, [{ is_super_admin: true }]]; // loadAdminScope
const superEmail: any = [/SELECT email FROM users WHERE id = \$1 LIMIT 1/i, [{ email: "super@x.com" }]];

test("getAdminProfile: not found / success", async () => {
  const { getAdminProfile } = await load();
  route([scope, [/display_name, phone, photo_url\s+FROM users WHERE id/i, []]]);
  let c = reqres({ user: admin });
  await getAdminProfile(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Admin account not found/);
  route([scope, [/display_name, phone, photo_url\s+FROM users WHERE id/i, [{ id: "a1", email: "a@b.com", username: "x" }]], [/total_schools/i, [{ total_schools: 2, total_institutes: 1, owned_schools: 1, owned_institutes: 0 }]]]);
  c = reqres({ user: admin });
  await getAdminProfile(c.req, c.res, c.next);
  assert.equal(c.res.body.user.orgScope.totalSchools, 2);
});
test("listManagedAdmins", async () => {
  const { listManagedAdmins } = await load();
  route([scope, [/FROM users\s+WHERE role = 'admin'\s+ORDER BY/i, [{ id: "a2" }]]]);
  const c = reqres({ user: admin });
  await listManagedAdmins(c.req, c.res, c.next); assert.equal(c.res.body.admins.length, 1);
});
test("createManagedAdmin: validations + duplicate + success", async () => {
  const { createManagedAdmin } = await load();
  const base = { displayName: "Admin X", username: "adminx", email: "x@y.com", phone: "1234567890", whatsapp: "1234567890", password: "password1" };
  const run = async (over: Record<string, unknown>, rules: any[] = [scope]) => { route(rules); const c = reqres({ user: admin, body: { ...base, ...over } }); await createManagedAdmin(c.req, c.res, c.next); return c; };
  assert.match(String(((await run({ whatsapp: "" })).getErr() as Error).message), /WhatsApp number is required/);
  assert.match(String(((await run({ displayName: "" })).getErr() as Error).message), /name is required/);
  assert.match(String(((await run({ email: "bad" })).getErr() as Error).message), /Valid email/);
  assert.match(String(((await run({ phone: "12" })).getErr() as Error).message), /Phone must be 10/);
  assert.match(String(((await run({ password: "short" })).getErr() as Error).message), /at least 8/);
  assert.match(String(((await run({}, [scope, [/SELECT id FROM users/i, [{ id: "dup" }]]])).getErr() as Error).message), /already in use/);
  const c = await run({}, [scope, [/SELECT id FROM users/i, []], [/INSERT INTO users/i, [{ id: "a2", email: "x@y.com" }]]]);
  assert.equal(c.res.code, 201);
});
test("updateManagedAdmin: id / not found / super-guard / success", async () => {
  const { updateManagedAdmin } = await load();
  route([scope]);
  let c = reqres({ user: admin, params: {} });
  await updateManagedAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([scope, [/SELECT id, is_super_admin FROM users/i, []]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: {} });
  await updateManagedAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([scope, [/SELECT id, is_super_admin FROM users/i, [{ id: "a2", is_super_admin: true }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: {} });
  await updateManagedAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /cannot be edited/);
  route([scope, [/SELECT id, is_super_admin FROM users/i, [{ id: "a2", is_super_admin: false }]], [/UPDATE users SET/i, [{ id: "a2", email: "n@y.com" }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: { displayName: "New" } });
  await updateManagedAdmin(c.req, c.res, c.next); assert.equal(c.res.body.admin.id, "a2");
});
test("requestManagedAdminDeleteOtp + deleteManagedAdmin", async () => {
  const { requestManagedAdminDeleteOtp, deleteManagedAdmin } = await load();
  route([scope, [/SELECT email, is_super_admin FROM users/i, [{ email: "t@y.com", is_super_admin: false }]], superEmail]);
  let c = reqres({ user: admin, params: { id: "a2" } });
  await requestManagedAdminDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  // delete success
  route([scope, [/SELECT id, is_super_admin FROM users/i, [{ id: "a2", is_super_admin: false }]]]);
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id FROM (schools|institutes|organizations)/i, []], [/BEGIN|COMMIT|SAVEPOINT|DELETE|UPDATE/i, []]]));
  c = reqres({ user: admin, params: { id: "a2" }, body: { otp: "123456" } });
  await deleteManagedAdmin(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
});
test("changeManagedAdminPassword: validations + success", async () => {
  const { changeManagedAdminPassword, requestManagedAdminPasswordOtp } = await load();
  route([scope, superEmail]);
  let c = reqres({ user: admin, params: { id: "a2" } });
  await requestManagedAdminPasswordOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  route([scope]);
  c = reqres({ user: admin, params: { id: "a2" }, body: { password: "short", otp: "123456" } });
  await changeManagedAdminPassword(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least 8/);
  route([scope, [/SELECT is_super_admin FROM users WHERE id = \$1 AND role/i, [{ is_super_admin: false }]], [/UPDATE users SET password_hash/i, []]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: { password: "password1", otp: "123456" } });
  await changeManagedAdminPassword(c.req, c.res, c.next); assert.equal(c.res.body.updated, true);
});
test("uploadManagedAdminPhoto: required / remove / upload", async () => {
  const { uploadManagedAdminPhoto } = await load();
  route([scope]);
  let c = reqres({ user: admin, params: { id: "a2" }, body: {} });
  await uploadManagedAdminPhoto(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Photo file is required/);
  route([scope, [/UPDATE users SET photo_url = NULL/i, [{ id: "a2", photo_url: null }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: { remove: "true" } });
  await uploadManagedAdminPhoto(c.req, c.res, c.next); assert.equal(c.res.body.admin.id, "a2");
  route([scope, [/UPDATE users SET photo_url = \$2/i, [{ id: "a2", photo_url: "u" }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: {} }); c.req.file = { mimetype: "image/png", buffer: Buffer.from("x") } as any;
  await uploadManagedAdminPhoto(c.req, c.res, c.next); assert.equal(c.res.body.admin.photo_url, "u");
});
test("setManagedAdminActive: not found / super-guard / validation / success", async () => {
  const { setManagedAdminActive } = await load();
  route([scope, [/SELECT id, is_super_admin FROM users/i, []]]);
  let c = reqres({ user: admin, params: { id: "a2" }, body: { isActive: true } });
  await setManagedAdminActive(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([scope, [/SELECT id, is_super_admin FROM users/i, [{ id: "a2", is_super_admin: true }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: { isActive: true } });
  await setManagedAdminActive(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /cannot be changed/);
  route([scope, [/SELECT id, is_super_admin FROM users/i, [{ id: "a2", is_super_admin: false }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: {} });
  await setManagedAdminActive(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /isActive boolean/);
  route([scope, [/SELECT id, is_super_admin FROM users/i, [{ id: "a2", is_super_admin: false }]], [/UPDATE users SET is_active/i, [{ id: "a2", is_active: false }]]]);
  c = reqres({ user: admin, params: { id: "a2" }, body: { isActive: false } });
  await setManagedAdminActive(c.req, c.res, c.next); assert.equal(c.res.body.admin.is_active, false);
});
test("getManagedAdminOverview: not found / success", async () => {
  const { getManagedAdminOverview } = await load();
  route([scope, [/FROM users\s+WHERE id = \$1\s+AND role = 'admin'\s+AND COALESCE\(is_super_admin/i, []]]);
  let c = reqres({ user: admin, params: { id: "a2" } });
  await getManagedAdminOverview(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([scope, [/COALESCE\(is_super_admin, false\) = false/i, [{ id: "a2", email: "t@y.com" }]], [/FROM schools s/i, [{ id: "s1", name: "S", password: "plain-pw" }]], [/FROM institutes i/i, []]]);
  c = reqres({ user: admin, params: { id: "a2" } });
  await getManagedAdminOverview(c.req, c.res, c.next);
  assert.equal(c.res.body.schools[0].password, "plain-pw");
});
test("updateOwnDisplayName", async () => {
  const { updateOwnDisplayName } = await load();
  route([scope]);
  let c = reqres({ user: admin, body: { displayName: "" } });
  await updateOwnDisplayName(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Enter a name/);
  route([scope, [/UPDATE users SET display_name/i, []]]);
  c = reqres({ user: admin, body: { displayName: "Harsha" } });
  await updateOwnDisplayName(c.req, c.res, c.next); assert.equal(c.res.body.displayName, "Harsha");
});
