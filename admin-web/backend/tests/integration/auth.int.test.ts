/**
 * INTEGRATION TEST — runs against a REAL Postgres database and the REAL Express app
 * (no mocks). Intended for CI, not the offline unit harness.
 *
 * Prereqs (the GitHub Actions `tests` workflow sets these up):
 *   1. A Postgres service, with DATABASE_URL pointing at it.
 *   2. psql -f scripts/test-schema.sql   (base tables)
 *   3. npm run migrate                   (adds the rest of the schema)
 *   4. NODE_ENV=test  (so src/index.ts does not bind a port / start cron)
 *   5. JWT_SECRET set.
 *
 * Run locally:  NODE_ENV=test DATABASE_URL=... JWT_SECRET=test npm run test:integration
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../../src/index.ts";
import { pool } from "../../src/config/database.ts";

const EMAIL = `ci-admin+${Date.now()}@example.com`;
const PASSWORD = "password1!";

before(async () => {
  // Clean slate for setup-first-admin (refuses once any admin exists).
  await pool.query(`DELETE FROM users WHERE role = 'admin'`);
});
after(async () => {
  await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  await pool.end();
});

test("GET /api/health → 200", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("POST /api/auth/setup-first-admin creates the first admin, then refuses", async () => {
  const first = await request(app).post("/api/auth/setup-first-admin").send({ email: EMAIL, password: PASSWORD });
  assert.equal(first.status, 201);
  assert.equal(first.body.user.email, EMAIL.toLowerCase());
  const second = await request(app).post("/api/auth/setup-first-admin").send({ email: "other@example.com", password: PASSWORD });
  assert.equal(second.status, 403);
});

test("POST /api/auth/login succeeds with the new admin and issues a token", async () => {
  const res = await request(app).post("/api/auth/login").send({ email: EMAIL, password: PASSWORD, audience: "admin" });
  assert.equal(res.status, 200);
  assert.ok(res.body.token, "a JWT is returned");
  assert.equal(res.body.user.role, "admin");
});

test("POST /api/auth/login rejects a wrong password", async () => {
  const res = await request(app).post("/api/auth/login").send({ email: EMAIL, password: "wrong", audience: "admin" });
  assert.equal(res.status, 401);
});

test("POST /api/auth/login validates required fields", async () => {
  const res = await request(app).post("/api/auth/login").send({});
  assert.equal(res.status, 400);
});

test("GET /api/auth/support-contacts → 200 shape", async () => {
  const res = await request(app).get("/api/auth/support-contacts");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("POST /api/auth/register is protected (401 without a token)", async () => {
  const res = await request(app).post("/api/auth/register").send({ email: "t@example.com", password: PASSWORD, role: "teacher" });
  assert.equal(res.status, 401);
});
