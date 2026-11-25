import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

afterEach(() => mock.restoreAll());

test("healthController: 200 ok", async () => {
  const { healthCheck } = await import("../../src/controllers/healthController.ts");
  const c = reqres({});
  healthCheck(c.req, c.res);
  assert.equal(c.res.code, 200);
  assert.deepEqual(c.res.body, { status: "ok" });
});

test("customerBrandController.getTeacherBranding: unauthorized / platform / child", async () => {
  const { getTeacherBranding } = await import("../../src/controllers/customerBrandController.ts");
  let c = reqres({ user: undefined });
  (c.res as any).set = () => c.res;
  await getTeacherBranding(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Unauthorized/);

  // platform (no child owner)
  route([[/FROM users me/i, [{ owner_id: null, photo_url: "p", display_name: "Plat" }]]]);
  c = reqres({ user: { userId: "u1" } }); (c.res as any).set = () => c.res;
  await getTeacherBranding(c.req, c.res, c.next);
  assert.equal(c.res.body.branding.source, "platform");

  // child-owned (owner present, not super admin)
  route([[/FROM users me/i, [{ owner_id: "a1", photo_url: "p", display_name: "Acme", is_super_admin: false, email: "a@b.com" }]]]);
  c = reqres({ user: { userId: "u1" } }); (c.res as any).set = () => c.res;
  await getTeacherBranding(c.req, c.res, c.next);
  assert.equal(c.res.body.branding.source, "child");
  assert.equal(c.res.body.branding.adminName, "Acme");
});

test("cleanupController.runCleanupNow: super-admin gated + result", async () => {
  mock.module("../../src/jobs/photoCleanup.ts", { namedExports: { runPhotoCleanup: async () => ({ scanned: 5, deleted: 2, failures: 0 }) } });
  const { runCleanupNow } = await import("../../src/controllers/cleanupController.ts");
  // not super admin -> requireSuperAdmin throws (no admin row)
  route([[/FROM users WHERE id/i, []]]);
  let c = reqres({ user: { userId: "a1", role: "admin" } });
  await runCleanupNow(c.req, c.res, c.next);
  assert.ok(c.getErr() !== "none");
  // super admin -> runs
  route([[/FROM users WHERE id/i, [{ is_super_admin: true }]]]);
  c = reqres({ user: { userId: "a1", role: "admin" } });
  await runCleanupNow(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.deepEqual(c.res.body, { success: true, scanned: 5, deleted: 2, failures: 0 });
});

// ---- selectionLockController ----
const teacher = { userId: "u1", role: "teacher", schoolId: "s1" };
const stateRow = (o: Record<string, unknown> = {}) => [{ template_locked: false, model_locked: false, final_by: null, final_name: null, final_at: null, ...o }];

test("getTeacherSelection + teacherOrgTable", async () => {
  const { getTeacherSelection, teacherOrgTable } = await import("../../src/controllers/selectionLockController.ts");
  assert.equal(teacherOrgTable({ role: "teacher", schoolId: "s1" } as any), "schools");
  assert.equal(teacherOrgTable({ role: "institute_staff", instituteId: "i1" } as any), "institutes");
  assert.equal(teacherOrgTable({ role: "organization_staff", organizationId: "o1" } as any), "organizations");
  route([[/FROM schools o/i, stateRow()]]);
  const c = reqres({ user: teacher });
  await getTeacherSelection(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.selection.canChange, true);
});
test("loadSelectionState: not found throws", async () => {
  const { getTeacherSelection } = await import("../../src/controllers/selectionLockController.ts");
  route([[/FROM schools o/i, []]]);
  const c = reqres({ user: teacher });
  await getTeacherSelection(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Organization not found/);
});
test("setTeacherSelectionFinal: validation + set/unset", async () => {
  const { setTeacherSelectionFinal } = await import("../../src/controllers/selectionLockController.ts");
  let c = reqres({ user: teacher, body: { final: "yes" } });
  await setTeacherSelectionFinal(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /true or false/);
  route([[/FROM schools o/i, stateRow()], [/UPDATE schools/i, []]]);
  c = reqres({ user: teacher, body: { final: true } });
  await setTeacherSelectionFinal(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
});
test("assertCanChangeSelection via setFinal: template/model locked, final by other", async () => {
  const { setTeacherSelectionFinal } = await import("../../src/controllers/selectionLockController.ts");
  route([[/FROM schools o/i, stateRow({ template_locked: true })]]);
  let c = reqres({ user: teacher, body: { final: true } });
  await setTeacherSelectionFinal(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Template selection is turned off/);
  route([[/FROM schools o/i, stateRow({ model_locked: true })]]);
  c = reqres({ user: teacher, body: { final: true } });
  await setTeacherSelectionFinal(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Model selection is turned off/);
  route([[/FROM schools o/i, stateRow({ final_by: "other", final_name: "Priya" })]]);
  c = reqres({ user: teacher, body: { final: true } });
  await setTeacherSelectionFinal(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /final choice was made by Priya/);
});
test("adminSelectionLock: invalid id / PATCH / GET", async () => {
  const { adminSelectionLock } = await import("../../src/controllers/selectionLockController.ts");
  const scope = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]] as any;
  let c = reqres({ user: { userId: "a1", role: "admin" }, params: { kind: "schools", id: "bad" }, method: "GET" } as any);
  c.req.method = "GET";
  route(scope);
  await adminSelectionLock(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Invalid id/);

  const id = "11111111-1111-4111-8111-111111111111";
  route([...scope, [/UPDATE schools/i, []], [/FROM schools o/i, stateRow()]]);
  c = reqres({ user: { userId: "a1", role: "admin" }, params: { kind: "schools", id }, body: { locked: true, clearFinal: true } });
  c.req.method = "PATCH";
  await adminSelectionLock(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.ok(c.res.body.selection);
});
test("adminSelectionLock: unknown kind", async () => {
  const { adminSelectionLock } = await import("../../src/controllers/selectionLockController.ts");
  route([[/FROM users WHERE id/i, [{ is_super_admin: true }]]]);
  const c = reqres({ user: { userId: "a1", role: "admin" }, params: { kind: "widgets", id: "x" } });
  c.req.method = "GET";
  await adminSelectionLock(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Unknown organization type/);
});
