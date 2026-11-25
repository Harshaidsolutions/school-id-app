import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient, storageStub } from "../helpers/testkit.ts";

beforeEach(() => {
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/utils/adminOtp.ts", { namedExports: { requestAdminActionOtp: async () => ({ emailDelivery: "sent", message: "sent" }), verifyAdminActionOtp: async () => {} } });
  mock.module("../../src/controllers/formConfigController.ts", { namedExports: { seedDefaultFormConfig: async () => {} } });
});
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/instituteController.ts");
const admin = { userId: "a1", role: "admin" };
const scope: any = [/is_active = true LIMIT 1/i, [{ is_super_admin: true }]];
const UUID = "11111111-1111-4111-8111-111111111111";

test("createInstitute: name required + success", async () => {
  const { createInstitute } = await load();
  route([scope]);
  let c = reqres({ user: admin, body: {} });
  await createInstitute(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Institute name is required/);
  route([scope, [/INSERT INTO institutes/i, [{ id: "i1", name: "Inst" }]]]);
  c = reqres({ user: admin, body: { name: "Inst" } });
  await createInstitute(c.req, c.res, c.next); assert.equal(c.res.code, 201); assert.equal(c.res.body.institute.name, "Inst");
});
test("createInstituteWithOwner: validation + success", async () => {
  const { createInstituteWithOwner } = await load();
  mock.method(pool, "connect", async () => fakeClient([scope]));
  const run = async (body: Record<string, unknown>) => { const c = reqres({ user: admin, body }); await createInstituteWithOwner(c.req, c.res, c.next); return c; };
  assert.match(String(((await run({})).getErr() as Error).message), /Institute name is required/);
  assert.match(String(((await run({ instituteName: "I" })).getErr() as Error).message), /Owner name is required/);
  assert.match(String(((await run({ instituteName: "I", ownerName: "O" })).getErr() as Error).message), /Password is required/);
  mock.method(pool, "connect", async () => fakeClient([
    [/\) accounts/i, []], [/SELECT 1 FROM users WHERE lower\(email\)/i, []],
    [/INSERT INTO institutes/i, [{ id: "i1", name: "I" }]], [/INSERT INTO users/i, []], [/BEGIN|COMMIT/i, []],
  ]));
  route([scope]);
  const c = await run({ instituteName: "I", ownerName: "owner", password: "password1" });
  assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201);
});
test("listInstitutes", async () => {
  const { listInstitutes } = await load();
  route([scope, [/FROM institutes i/i, [{ id: "i1" }]]]);
  const c = reqres({ user: admin, query: {} });
  await listInstitutes(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("updateInstitute: id / not found / success", async () => {
  const { updateInstitute } = await load();
  route([scope]);
  let c = reqres({ user: admin, params: {} });
  await updateInstitute(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([scope, [/SELECT \* FROM institutes WHERE id/i, []]]);
  c = reqres({ user: admin, params: { id: "i1" }, body: {} });
  await updateInstitute(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Institute not found/);
  route([scope, [/SELECT \* FROM institutes WHERE id/i, [{ id: "i1", name: "Old" }]], [/UPDATE institutes/i, [{ id: "i1", name: "Old" }]]]);
  c = reqres({ user: admin, params: { id: "i1" }, body: { phone: "999" } });
  await updateInstitute(c.req, c.res, c.next); assert.equal(c.res.body.institute.id, "i1");
});
test("setInstituteActive + setInstituteCapturePolicy", async () => {
  const { setInstituteActive, setInstituteCapturePolicy } = await load();
  let c = reqres({ user: admin, params: { id: "i1" }, body: {} });
  await setInstituteActive(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /is_active is required/);
  route([[/UPDATE institutes/i, [{ id: "i1", is_active: false }]]]);
  c = reqres({ user: admin, params: { id: "i1" }, body: { is_active: false } });
  await setInstituteActive(c.req, c.res, c.next); assert.equal(c.res.body.institute.is_active, false);
  route([scope, [/UPDATE institutes/i, [{ id: "i1" }]]]);
  c = reqres({ user: admin, params: { id: "i1" }, body: { allow_screenshot: true, allow_screen_recording: true } });
  await setInstituteCapturePolicy(c.req, c.res, c.next); assert.equal(c.res.body.institute.id, "i1");
});
test("requestInstituteDeleteOtp + deleteInstitute", async () => {
  const { requestInstituteDeleteOtp, deleteInstitute } = await load();
  route([[/SELECT name FROM institutes/i, []]]);
  let c = reqres({ user: admin, params: { id: "i1" } });
  await requestInstituteDeleteOtp(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Institute not found/);
  route([[/SELECT name FROM institutes/i, [{ name: "I" }]], [/email FROM users WHERE id/i, [{ email: "a@b.com" }]]]);
  c = reqres({ user: admin, params: { id: "i1" } });
  await requestInstituteDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, name FROM institutes[\s\S]*FOR UPDATE/i, [{ id: "i1", name: "I" }]], [/BEGIN|COMMIT|DELETE/i, []]]));
  c = reqres({ user: admin, params: { id: "i1" }, body: { otp: "123456" } });
  await deleteInstitute(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
});
test("requestInstituteBulkDeleteOtp + bulkDeleteInstitutes", async () => {
  const { requestInstituteBulkDeleteOtp, bulkDeleteInstitutes } = await load();
  route([scope, [/FROM institutes WHERE id = \$1 AND owner_admin_id/i, [{ id: UUID }]], [/SELECT id FROM institutes WHERE id = ANY/i, [{ id: UUID }]], [/email FROM users WHERE id/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, body: { ids: [UUID] } });
  await requestInstituteBulkDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, owner_admin_id FROM institutes WHERE id = ANY/i, [{ id: UUID, owner_admin_id: "a1" }]], [/DELETE FROM institutes WHERE id = ANY[\s\S]*RETURNING/i, [{ id: UUID }]], [/BEGIN|COMMIT|DELETE/i, []]]));
  route([scope, [/FROM institutes WHERE id = \$1 AND owner_admin_id/i, [{ id: UUID }]], [/SELECT id FROM institutes WHERE id = ANY/i, [{ id: UUID }]]]);
  c = reqres({ user: admin, body: { ids: [UUID], otp: "123456" } });
  await bulkDeleteInstitutes(c.req, c.res, c.next); assert.deepEqual(c.res.body.deleted, [UUID]);
});
