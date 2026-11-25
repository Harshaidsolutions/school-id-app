import { test, mock, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { pool } from "../../src/config/database.ts";
import { authMiddleware, requireRole, signAuthToken, credentialVersion } from "../../src/middleware/auth.ts";

before(() => { process.env.JWT_SECRET = "test-secret"; });
afterEach(() => mock.restoreAll());

const call = async (headers: Record<string, string>) => {
  const req: any = { headers }; let err: unknown = "none";
  await authMiddleware(req, {} as any, ((e?: unknown) => { err = e; }) as any);
  return { req, err };
};

test("credentialVersion is deterministic hmac", () => {
  assert.equal(credentialVersion("hash"), credentialVersion("hash"));
  assert.notEqual(credentialVersion("a"), credentialVersion("b"));
});
test("missing/!Bearer header => 401", async () => {
  assert.match(String((await call({})).err && ((await call({})).err as Error).message), /Authorization header/);
  assert.match(String(((await call({ authorization: "Bearer " })).err as Error).message), /Authorization header/);
});
test("valid token loads the user", async () => {
  const hash = "pw-hash";
  const token = signAuthToken({ userId: "u1", role: "admin", credentialVersion: credentialVersion(hash) } as any);
  mock.method(pool, "query", async () => ({ rows: [{ role: "admin", school_id: null, institute_id: null, organization_id: null, assigned_class: null, assigned_section: null, is_super_admin: true, is_active: true, password_hash: hash }] }) as any);
  const { req, err } = await call({ authorization: `Bearer ${token}` });
  assert.equal(err, undefined);
  assert.equal(req.user.userId, "u1");
  assert.equal(req.user.isSuperAdmin, true);
});
test("inactive / role mismatch / credential bump => session expired", async () => {
  const hash = "pw-hash";
  const token = signAuthToken({ userId: "u1", role: "admin", credentialVersion: credentialVersion(hash) } as any);
  mock.method(pool, "query", async () => ({ rows: [{ role: "admin", is_active: false, password_hash: hash }] }) as any);
  assert.match(String(((await call({ authorization: `Bearer ${token}` })).err as Error).message), /sign in again/);
});
test("invalid token => Invalid token", async () => {
  const { err } = await call({ authorization: "Bearer not.a.jwt" });
  assert.match(String((err as Error).message), /Invalid token/);
});
test("expired token => Token expired", async () => {
  const token = jwt.sign({ userId: "u1", role: "admin" }, "test-secret", { expiresIn: -10 });
  assert.match(String(((await call({ authorization: `Bearer ${token}` })).err as Error).message), /expired/i);
});
test("payload without userId/role => invalid payload", async () => {
  const token = jwt.sign({ foo: 1 }, "test-secret");
  assert.match(String(((await call({ authorization: `Bearer ${token}` })).err as Error).message), /Invalid token payload/);
});
test("missing JWT_SECRET => configured error", async () => {
  delete process.env.JWT_SECRET;
  const { err } = await call({ authorization: "Bearer x.y.z" });
  assert.match(String((err as Error).message), /JWT_SECRET is not configured/);
  process.env.JWT_SECRET = "test-secret";
});
test("unexpected DB error bubbles through next", async () => {
  const hash = "h";
  const token = signAuthToken({ userId: "u1", role: "admin", credentialVersion: credentialVersion(hash) } as any);
  mock.method(pool, "query", async () => { throw new Error("db down"); });
  const { err } = await call({ authorization: `Bearer ${token}` });
  assert.match(String((err as Error).message), /db down/);
});
test("requireRole", () => {
  const mk = (user?: unknown) => { let e: unknown = "none"; requireRole("admin")({ user } as any, {} as any, ((x?: unknown) => { e = x; }) as any); return e; };
  assert.match(String((mk() as Error).message), /Authentication required/);
  assert.match(String((mk({ role: "teacher" }) as Error).message), /insufficient permissions/);
  assert.equal(mk({ role: "admin" }), undefined);
});
