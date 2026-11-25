import { test, mock, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { route, reqres, fakeClient } from "../helpers/testkit.ts";
import { pool } from "../../src/config/database.ts";

before(() => {
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.DESKTOP_LICENSE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
});
mock.module("../../src/middleware/attemptLimit.ts", { namedExports: { consumeAttempt: () => {} } });
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/desktopLicenseController.ts");
const KEY = "MSIDC-ABCDE-FGHJK-LMNPQ-RSTUV";
const MACHINE = "a".repeat(64);
const superScope: any = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]];
const row = (o: Record<string, unknown> = {}) => ({ id: "l1", license_key: KEY, customer_name: "Cust", phone: "", notes: "", machine_id: null, machine_label: null, activated_at: null, last_seen_version: null, status: "active", expires_at: null, created_at: "t", ...o });

test("publicKey PEM + endpoint", async () => {
  const { desktopLicensePublicKeyPem, getDesktopLicensePublicKey } = await load();
  assert.match(desktopLicensePublicKeyPem(), /BEGIN PUBLIC KEY/);
  const c = reqres({}); let sent = ""; (c.res as any).type = () => ({ send: (b: string) => { sent = b; } });
  await getDesktopLicensePublicKey(c.req, c.res, c.next);
  assert.match(sent, /BEGIN PUBLIC KEY/);
});
test("listDesktopLicenses: expired shown as expired", async () => {
  const { listDesktopLicenses } = await load();
  route([...superScope, [/FROM desktop_licenses ORDER BY/i, [row({ status: "active", expires_at: new Date(Date.now() - 1000).toISOString() })]]]);
  const c = reqres({ user: { userId: "a1", role: "admin" } });
  await listDesktopLicenses(c.req, c.res, c.next);
  assert.equal(c.res.body.licenses[0].status, "expired");
});
test("createDesktopLicense: validation + success + exhausted", async () => {
  const { createDesktopLicense } = await load();
  route(superScope);
  let c = reqres({ user: { userId: "a1", role: "admin" }, body: {} });
  await createDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Customer name/);
  c = reqres({ user: { userId: "a1", role: "admin" }, body: { customerName: "C", expiresAt: "not-a-date" } });
  await createDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Invalid expiry/);
  route([...superScope, [/INSERT INTO desktop_licenses/i, [row()]]]);
  c = reqres({ user: { userId: "a1", role: "admin" }, body: { customerName: "C" } });
  await createDesktopLicense(c.req, c.res, c.next); assert.equal(c.res.code, 201);
  route([...superScope, [/INSERT INTO desktop_licenses/i, []]]);
  c = reqres({ user: { userId: "a1", role: "admin" }, body: { customerName: "C" } });
  await createDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Could not create/);
});
test("updateDesktopLicenseStatus: actions + unknown + not found", async () => {
  const { updateDesktopLicenseStatus } = await load();
  route([...superScope, [/UPDATE desktop_licenses SET status='revoked'/i, [row({ status: "revoked" })]]]);
  let c = reqres({ user: { userId: "a1", role: "admin" }, params: { action: "revoke", id: "l1" } });
  await updateDesktopLicenseStatus(c.req, c.res, c.next); assert.equal(c.res.body.license.status, "revoked");
  route(superScope);
  c = reqres({ user: { userId: "a1", role: "admin" }, params: { action: "frobnicate", id: "l1" } });
  await updateDesktopLicenseStatus(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Unknown action/);
  route([...superScope, [/UPDATE desktop_licenses SET machine_id=NULL/i, []]]);
  c = reqres({ user: { userId: "a1", role: "admin" }, params: { action: "reset-machine", id: "l1" } });
  await updateDesktopLicenseStatus(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
});
test("deleteDesktopLicense", async () => {
  const { deleteDesktopLicense } = await load();
  route([...superScope, [/DELETE FROM desktop_licenses/i, []]]);
  let c = reqres({ user: { userId: "a1", role: "admin" }, params: { id: "l1" } });
  await deleteDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
});
test("activateDesktopLicense: validation + success + mismatch", async () => {
  const { activateDesktopLicense } = await load();
  let c = reqres({ body: { licenseKey: "bad", machineId: MACHINE } });
  await activateDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /valid licence key/);
  c = reqres({ body: { licenseKey: KEY, machineId: "short" } });
  await activateDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Invalid machine id/);
  // success
  mock.method(pool, "connect", async () => fakeClient([[/SELECT \* FROM desktop_licenses WHERE license_key/i, [row()]], [/UPDATE desktop_licenses SET machine_id/i, [row({ machine_id: MACHINE })]], [/BEGIN|COMMIT/i, []]]));
  c = reqres({ body: { licenseKey: KEY, machineId: MACHINE, machineLabel: "PC", appVersion: "1.0" } });
  await activateDesktopLicense(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.ok(c.res.body.license.payload && c.res.body.license.signature);
  // machine mismatch
  mock.method(pool, "connect", async () => fakeClient([[/SELECT \* FROM desktop_licenses WHERE license_key/i, [row({ machine_id: "b".repeat(64) })]], [/BEGIN|ROLLBACK/i, []]]));
  c = reqres({ body: { licenseKey: KEY, machineId: MACHINE } });
  await activateDesktopLicense(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /already activated on another/);
});
test("checkDesktopLicense: statuses", async () => {
  const { checkDesktopLicense } = await load();
  const run = async (rows: any) => { route(rows); const c = reqres({ body: { licenseKey: KEY, machineId: MACHINE } }); await checkDesktopLicense(c.req, c.res, c.next); return c.res.body; };
  assert.equal((await run([[/SELECT \* FROM desktop_licenses/i, []]])).status, "not_found");
  assert.equal((await run([[/SELECT \* FROM desktop_licenses/i, [row({ status: "revoked" })]]])).status, "disabled");
  assert.equal((await run([[/SELECT \* FROM desktop_licenses/i, [row({ expires_at: new Date(Date.now() - 1000).toISOString() })]]])).status, "expired");
  assert.equal((await run([[/SELECT \* FROM desktop_licenses/i, [row({ machine_id: "b".repeat(64) })]]])).status, "moved");
  assert.equal((await run([[/SELECT \* FROM desktop_licenses/i, [row({ machine_id: MACHINE })]], [/UPDATE desktop_licenses/i, []]])).status, "active");
});
