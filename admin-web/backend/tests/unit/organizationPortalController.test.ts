import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient, storageStub } from "../helpers/testkit.ts";

beforeEach(() => {
  process.env.PUBLIC_WEB_ORIGIN = "https://app.test";
  mock.module("../../src/config/storage.ts", { namedExports: storageStub });
  mock.module("../../src/utils/adminOtp.ts", { namedExports: { requestAdminActionOtp: async () => ({ emailDelivery: "sent", message: "sent" }), verifyAdminActionOtp: async () => {} } });
});
afterEach(() => { delete process.env.PUBLIC_WEB_ORIGIN; mock.restoreAll(); });
const load = () => import("../../src/controllers/organizationPortalController.ts");
const admin = { userId: "a1", role: "admin" };
const scope: any = [/is_active = true LIMIT 1/i, [{ is_super_admin: true }]];
const owned: any = [/SELECT id FROM organizations o WHERE o\.id/i, [{ id: "o1" }]];
const UUID = "11111111-1111-4111-8111-111111111111";

test("assertOrganizationOwned: owned passes, missing throws", async () => {
  const { assertOrganizationOwned } = await load();
  route([owned]);
  await assert.doesNotReject(() => assertOrganizationOwned({ adminUserId: "a1", isSuperAdmin: true } as any, "o1"));
  route([[/SELECT id FROM organizations o WHERE o\.id/i, []]]);
  await assert.rejects(() => assertOrganizationOwned({ adminUserId: "a1", isSuperAdmin: false } as any, "o1"), /Organization not found/);
});
test("listOrganizations", async () => {
  const { listOrganizations } = await load();
  route([scope, [/FROM organizations o/i, [{ id: "o1" }]]]);
  const c = reqres({ user: admin });
  await listOrganizations(c.req, c.res, c.next); assert.equal(c.res.body.organizations.length, 1);
});
test("createOrganization: validations + success", async () => {
  const { createOrganization } = await load();
  route([scope]);
  mock.method(pool, "connect", async () => fakeClient([scope]));
  const run = async (body: Record<string, unknown>) => { const c = reqres({ user: admin, body }); await createOrganization(c.req, c.res, c.next); return c; };
  assert.match(String(((await run({})).getErr() as Error).message), /name is required/);
  assert.match(String(((await run({ name: "O" })).getErr() as Error).message), /Phone number is required/);
  assert.match(String(((await run({ name: "O", phone: "1" })).getErr() as Error).message), /Username is required/);
  assert.match(String(((await run({ name: "O", phone: "1", username: "u" })).getErr() as Error).message), /Password is required/);
  route([scope]);
  mock.method(pool, "connect", async () => fakeClient([[/\) accounts/i, []], [/SELECT 1 FROM users WHERE lower\(email\)/i, []], [/INSERT INTO organizations/i, [{ id: "o1", name: "O" }]], [/INSERT INTO users/i, []], [/BEGIN|COMMIT/i, []]]));
  const c = await run({ name: "O", phone: "123", username: "owner", password: "password1" });
  assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201);
});
test("getPublicOrganizationForm: not found + success", async () => {
  const { getPublicOrganizationForm } = await load();
  route([[/FROM organization_forms f\s+JOIN organizations/i, []]]);
  let c = reqres({ params: { token: "tok" } });
  await getPublicOrganizationForm(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not available/);
  route([[/FROM organization_forms f\s+JOIN organizations/i, [{ id: "f1", is_active: true, organization_name: "O", organization_active: true }]], [/FROM organization_form_fields/i, [{ id: "fld1", field_name: "Name", field_type: "text", required: true, enabled: true }]]]);
  c = reqres({ params: { token: "tok" } });
  await getPublicOrganizationForm(c.req, c.res, c.next); assert.equal(c.res.body.organizationName, "O");
});
test("updateOrganizationDetails", async () => {
  const { updateOrganizationDetails } = await load();
  route([scope, owned, [/SELECT COALESCE\(field_visibility/i, [{ field_visibility: {} }]], [/UPDATE organizations/i, [{ phone: "9", field_visibility: {} }]]]);
  const c = reqres({ user: admin, params: { id: "o1" }, body: { phone: "9" } });
  await updateOrganizationDetails(c.req, c.res, c.next); assert.equal(c.res.body.organization.phone, "9");
});
test("setOrganizationActive + capture", async () => {
  const { setOrganizationActive, setOrganizationCapturePolicy } = await load();
  route([scope, owned]);
  let c = reqres({ user: admin, params: { id: "o1" }, body: {} });
  await setOrganizationActive(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /is_active is required/);
  route([scope, owned, [/UPDATE organizations SET is_active/i, [{ id: "o1", is_active: false }]]]);
  c = reqres({ user: admin, params: { id: "o1" }, body: { is_active: false } });
  await setOrganizationActive(c.req, c.res, c.next); assert.equal(c.res.body.organization.is_active, false);
  route([scope, owned, [/UPDATE organizations[\s\S]*allow_screenshot/i, [{ id: "o1" }]]]);
  c = reqres({ user: admin, params: { id: "o1" }, body: { allow_screenshot: true, allow_screen_recording: true } });
  await setOrganizationCapturePolicy(c.req, c.res, c.next); assert.equal(c.res.body.organization.id, "o1");
});
test("updateOrganization: validations + success (existing owner)", async () => {
  const { updateOrganization } = await load();
  mock.method(pool, "connect", async () => fakeClient([scope, owned]));
  // assertOrganizationOwned uses pool.query (not client), so route it too
  route([scope, owned]);
  let c = reqres({ user: admin, params: { id: "o1" }, body: {} });
  await updateOrganization(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /name is required/);
  mock.method(pool, "connect", async () => fakeClient([[/FROM users\s+WHERE organization_id = \$1 AND role = 'organization_staff'/i, [{ id: "u1" }]], [/\) accounts/i, []], [/UPDATE organizations/i, [{ id: "o1", name: "O" }]], [/UPDATE users/i, []], [/BEGIN|COMMIT/i, []]]));
  route([scope, owned]);
  c = reqres({ user: admin, params: { id: "o1" }, body: { name: "O", phone: "1", username: "u", password: "password1" } });
  await updateOrganization(c.req, c.res, c.next); assert.equal(c.getErr(), "none"); assert.equal(c.res.body.organization.id, "o1");
});
test("org delete OTP flows (single + bulk + submissions)", async () => {
  const { requestOrganizationDeleteOtp, deleteOrganization, requestOrganizationBulkDeleteOtp, bulkDeleteOrganizations, requestOrganizationSubmissionDeleteOtp, deleteOrganizationSubmissions } = await load();
  route([scope, owned, [/SELECT name FROM organizations/i, [{ name: "O" }]], [/email FROM users/i, [{ email: "a@b.com" }]]]);
  let c = reqres({ user: admin, params: { id: "o1" } });
  await requestOrganizationDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/BEGIN|COMMIT|DELETE/i, []]]));
  route([scope, owned]);
  c = reqres({ user: admin, params: { id: "o1" }, body: { otp: "123456" } });
  await deleteOrganization(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
  route([scope, owned, [/email FROM users/i, [{ email: "a@b.com" }]]]);
  c = reqres({ user: admin, body: { ids: [UUID] } });
  await requestOrganizationBulkDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/SELECT id, owner_admin_id FROM organizations WHERE id = ANY/i, [{ id: UUID, owner_admin_id: "a1" }]], [/DELETE FROM organizations WHERE id = ANY[\s\S]*RETURNING/i, [{ id: UUID }]], [/BEGIN|COMMIT|DELETE/i, []]]));
  route([scope, owned]);
  c = reqres({ user: admin, body: { ids: [UUID], otp: "123456" } });
  await bulkDeleteOrganizations(c.req, c.res, c.next); assert.deepEqual(c.res.body.deleted, [UUID]);
  route([scope, owned, [/email FROM users/i, [{ email: "a@b.com" }]]]);
  c = reqres({ user: admin, params: { id: "o1" } });
  await requestOrganizationSubmissionDeleteOtp(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mock.method(pool, "connect", async () => fakeClient([[/DELETE FROM organization_submissions/i, [{}, {}]], [/BEGIN|COMMIT/i, []]]));
  route([scope, owned]);
  c = reqres({ user: admin, params: { id: "o1" }, body: { ids: ["s1", "s2"], otp: "123456" } });
  await deleteOrganizationSubmissions(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
});

test("getOrganizationWorkspaceAdmin: id required + success (no form)", async () => {
  const { getOrganizationWorkspaceAdmin } = await load();
  route([scope, owned]);
  let c = reqres({ user: admin, params: {} });
  await getOrganizationWorkspaceAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([scope, owned,
    [/FROM organizations WHERE id = \$1 LIMIT 1/i, [{ id: "o1", name: "O" }]],
    [/FROM organization_forms\s+WHERE organization_id = \$1 AND is_active = true/i, []],
    [/FROM organization_forms\s+WHERE organization_id = \$1\s+ORDER BY/i, []],
  ]);
  c = reqres({ user: admin, params: { id: "o1" } });
  await getOrganizationWorkspaceAdmin(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.body.form, null);
});
test("createOrganizationForm: validation + success", async () => {
  const { createOrganizationForm } = await load();
  route([scope, owned]);
  mock.method(pool, "connect", async () => fakeClient([]));
  let c = reqres({ user: admin, params: { id: "o1" }, body: { fields: [] } });
  await createOrganizationForm(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least one field/);
  c = reqres({ user: admin, params: { id: "o1" }, body: { fields: [{ fieldName: "X", fieldType: "weird" }] } });
  await createOrganizationForm(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Text, Photo or Dropdown/);
  // success
  route([scope, owned, [/FROM organization_form_fields/i, []], [/SELECT id FROM organization_forms WHERE organization_id = \$1 AND id <>/i, []]]);
  mock.method(pool, "connect", async () => fakeClient([
    [/SELECT id, public_token, is_active[\s\S]*is_active = true/i, []],
    [/INSERT INTO organization_forms/i, [{ id: "f1", public_token: "tok", is_active: true }]],
    [/INSERT INTO organization_form_fields/i, []],
    [/BEGIN|COMMIT/i, []],
  ]));
  c = reqres({ user: admin, params: { id: "o1" }, body: { fields: [{ fieldName: "Name", fieldType: "text" }] } });
  await createOrganizationForm(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.body.form.id, "f1");
});
