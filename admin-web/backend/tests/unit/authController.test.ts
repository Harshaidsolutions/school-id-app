import { test, mock, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { route, reqres } from "../helpers/testkit.ts";
import { SUPER_ADMIN_EMAIL } from "../../src/utils/adminScope.ts";

let mailDelivered = true;
mock.module("../../src/utils/email.ts", { namedExports: { sendEmail: async () => ({ delivered: mailDelivered, smtpConfigured: mailDelivered }) } });
const load = () => import("../../src/controllers/authController.ts");

before(() => { process.env.JWT_SECRET = "test-secret"; });
afterEach(() => { mailDelivered = true; delete process.env.NODE_ENV; mock.restoreAll(); });

// ---------- login ----------
test("login: validation", async () => {
  const { login } = await load();
  let c = reqres({ body: { audience: "weird", email: "a", password: "b" } });
  await login(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /audience/);
  c = reqres({ body: { email: "", password: "" } });
  await login(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /required/);
});
test("login: user not found / wrong password", async () => {
  const { login } = await load();
  route([[/FROM users u/i, []]]);
  let c = reqres({ body: { email: "x@y.com", password: "pw" } });
  await login(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /User not found/);
  route([[/FROM users u/i, [{ id: "1", role: "admin", password_hash: await bcrypt.hash("right", 10), is_active: true }]]]);
  c = reqres({ body: { email: "x@y.com", password: "wrong" } });
  await login(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Wrong password/);
});
test("login: disabled admin => 403", async () => {
  const { login } = await load();
  route([[/FROM users u/i, [{ id: "1", role: "admin", password_hash: await bcrypt.hash("pw", 10), is_active: false }]]]);
  const c = reqres({ body: { email: "x@y.com", password: "pw" } });
  await login(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /disabled/);
});
test("login: admin success issues token", async () => {
  const { login } = await load();
  const hash = await bcrypt.hash("pw", 10);
  route([[/see_all/i, [{ see_all: true }]], [/FROM users u/i, [{ id: "1", email: "x@y.com", username: "x", role: "admin", password_hash: hash, is_active: true, school_id: null, institute_id: null, organization_id: null }]]]);
  const c = reqres({ body: { email: "x@y.com", password: "pw", audience: "admin" } });
  await login(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.code, 200);
  assert.ok(c.res.body.token);
  assert.equal(c.res.body.user.isSuperAdmin, true);
});
test("login: teacher with inactive school => 403", async () => {
  const { login } = await load();
  const hash = await bcrypt.hash("pw", 10);
  route([[/FROM users u/i, [{ id: "1", role: "teacher", password_hash: hash, is_active: true, school_id: "s1", school_is_active: false }]]]);
  const c = reqres({ body: { email: "t@y.com", password: "pw", audience: "mobile" } });
  await login(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /inactive/);
});

// ---------- setupFirstAdmin ----------
test("setupFirstAdmin: blocked when an admin exists", async () => {
  const { setupFirstAdmin } = await load();
  route([[/COUNT\(\*\)/i, [{ count: "1" }]]]);
  const c = reqres({ body: { email: "a@b.com", password: "password1" } });
  await setupFirstAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Setup is disabled/);
});
test("setupFirstAdmin: validation + success", async () => {
  const { setupFirstAdmin } = await load();
  route([[/COUNT\(\*\)/i, [{ count: "0" }]], [/INSERT INTO users/i, [{ id: "1", email: "a@b.com", role: "admin", school_id: null }]]]);
  let c = reqres({ body: { email: "bad", password: "password1" } });
  await setupFirstAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /valid address/);
  c = reqres({ body: { email: "a@b.com", password: "short" } });
  await setupFirstAdmin(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least 8/);
  c = reqres({ body: { email: "a@b.com", password: "password1" } });
  await setupFirstAdmin(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201);
});

// ---------- register ----------
test("register: validations", async () => {
  const { register } = await load();
  const run = async (body: unknown) => { const c = reqres({ body, user: { userId: "a1", role: "admin" } }); await register(c.req, c.res, c.next); return c.getErr(); };
  assert.match(String((await run({ email: "", password: "" }) as Error).message), /required/);
  assert.match(String((await run({ email: "bad", password: "password1", role: "admin" }) as Error).message), /valid address/);
  assert.match(String((await run({ email: "a@b.com", password: "password1", role: "x" }) as Error).message), /admin.*teacher/);
  assert.match(String((await run({ email: "a@b.com", password: "password1", role: "teacher" }) as Error).message), /schoolId is required/);
  assert.match(String((await run({ email: "a@b.com", password: "password1", role: "teacher", schoolId: "s1" }) as Error).message), /assignedClass/);
  assert.match(String((await run({ email: "a@b.com", password: "password1", role: "teacher", schoolId: "s1", assignedClass: "5" }) as Error).message), /assignedSection/);
  assert.match(String((await run({ email: "a@b.com", password: "short", role: "teacher", schoolId: "s1", assignedClass: "5", assignedSection: "A" }) as Error).message), /at least 8/);
});
test("register: duplicate + success (teacher, admin-owned school)", async () => {
  const { register } = await load();
  route([[/FROM users WHERE id/i, [{ is_super_admin: true }]], [/FROM schools WHERE id = \$1 AND owner_admin_id/i, [{ id: "s1" }]], [/SELECT id FROM users WHERE lower\(email\)/i, [{ id: "dup" }]]]);
  let c = reqres({ body: { email: "a@b.com", password: "password1", role: "teacher", schoolId: "s1", assignedClass: "5", assignedSection: "A" }, user: { userId: "a1", role: "admin" } });
  await register(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /already exists/);

  route([[/FROM users WHERE id/i, [{ is_super_admin: true }]], [/FROM schools WHERE id = \$1 AND owner_admin_id/i, [{ id: "s1" }]], [/SELECT id FROM users WHERE lower\(email\)/i, []], [/INSERT INTO users/i, [{ id: "u1", email: "a@b.com", role: "teacher", school_id: "s1" }]]]);
  c = reqres({ body: { email: "a@b.com", password: "password1", role: "teacher", schoolId: "s1", assignedClass: "5", assignedSection: "A" }, user: { userId: "a1", role: "admin" } });
  await register(c.req, c.res, c.next); assert.equal(c.getErr(), "none"); assert.equal(c.res.code, 201);
});

// ---------- forgot / verify / reset ----------
const superUserRow = { id: "1", email: SUPER_ADMIN_EMAIL, role: "admin", is_super_admin: true, password_hash: "h", username: "super" };
test("forgotPassword: invalid email + non-super 403 + success", async () => {
  const { forgotPassword } = await load();
  let c = reqres({ body: { email: "bad" } }); await forgotPassword(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /valid email/);
  route([[/FROM users WHERE lower\(email\)/i, [{ id: "2", email: "other@x.com", role: "admin", is_super_admin: false }]]]);
  c = reqres({ body: { email: "other@x.com" } }); await forgotPassword(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /contact admin/i);
  route([[/FROM users WHERE lower\(email\)/i, [superUserRow]], [/UPDATE|INSERT/i, []]]);
  c = reqres({ body: { email: SUPER_ADMIN_EMAIL } }); await forgotPassword(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.body.codeSent, true); assert.equal(c.res.body.emailDelivery, "sent");
});
test("forgotPassword: dev otp when SMTP off", async () => {
  mailDelivered = false; process.env.NODE_ENV = "development";
  const { forgotPassword } = await load();
  mock.method(console, "log", () => {});
  route([[/FROM users WHERE lower\(email\)/i, [superUserRow]], [/UPDATE|INSERT/i, []]]);
  const c = reqres({ body: { email: SUPER_ADMIN_EMAIL } }); await forgotPassword(c.req, c.res, c.next);
  assert.match(c.res.body.devOtp, /^\d{6}$/);
});
test("verifyResetOtp: validations + success", async () => {
  const { verifyResetOtp } = await load();
  let c = reqres({ body: { email: "bad", otp: "123456" } }); await verifyResetOtp(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /valid email/);
  c = reqres({ body: { email: SUPER_ADMIN_EMAIL, otp: "12" } }); await verifyResetOtp(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /6-digit/);
  c = reqres({ body: { email: "notsuper@x.com", otp: "123456" } }); await verifyResetOtp(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Invalid or expired/);
  const otpHash = await bcrypt.hash("123456", 10);
  route([[/FROM password_reset_otps/i, [{ id: "o1", user_id: "1", otp_hash: otpHash, expires_at: new Date(Date.now() + 60000) }]], [/FROM users WHERE id/i, [superUserRow]], [/UPDATE|INSERT/i, []]]);
  c = reqres({ body: { email: SUPER_ADMIN_EMAIL, otp: "123456" } }); await verifyResetOtp(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.ok(c.res.body.resetToken);
});
test("resetPassword: validations + success", async () => {
  const { resetPassword } = await load();
  const crypto = await import("node:crypto");
  let c = reqres({ body: { email: "bad" } }); await resetPassword(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /valid email/);
  c = reqres({ body: { email: SUPER_ADMIN_EMAIL } }); await resetPassword(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Reset token is required/);
  c = reqres({ body: { email: SUPER_ADMIN_EMAIL, resetToken: "t", newPassword: "short" } }); await resetPassword(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least 8/);
  const token = "a".repeat(64);
  route([[/FROM password_reset_tokens/i, [{ id: "tk1", user_id: "1", expires_at: new Date(Date.now() + 60000) }]], [/FROM users WHERE id/i, [superUserRow]], [/BEGIN|COMMIT|UPDATE/i, []]]);
  c = reqres({ body: { email: SUPER_ADMIN_EMAIL, resetToken: token, newPassword: "password1" } });
  await resetPassword(c.req, c.res, c.next); assert.equal(c.getErr(), "none"); assert.match(c.res.body.message, /Password updated/);
});
test("getSuperAdminContacts", async () => {
  const { getSuperAdminContacts } = await load();
  route([[/preferred/i, [{ email: " a@b.com ", phone: " 123 ", whatsapp: null, facebook_url: null, instagram_url: null, youtube_url: null }]]]);
  const c = reqres({});
  await getSuperAdminContacts(c.req, c.res, c.next);
  assert.equal(c.res.body.email, "a@b.com"); assert.equal(c.res.body.phone, "123");
});

test("verifyResetOtp: no row / expired / mismatch / non-eligible user", async () => {
  const { verifyResetOtp } = await load();
  const run = async (rules: any) => { route(rules); const c = reqres({ body: { email: SUPER_ADMIN_EMAIL, otp: "123456" } }); await verifyResetOtp(c.req, c.res, c.next); return c.getErr(); };
  assert.match(String((await run([[/FROM password_reset_otps/i, []]]) as Error).message), /Invalid or expired/);
  const h = await bcrypt.hash("123456", 10);
  assert.match(String((await run([[/FROM password_reset_otps/i, [{ id: "o1", user_id: "1", otp_hash: h, expires_at: new Date(Date.now() - 1000) }]]]) as Error).message), /Invalid or expired/);
  assert.match(String((await run([[/FROM password_reset_otps/i, [{ id: "o1", user_id: "1", otp_hash: await bcrypt.hash("000000", 10), expires_at: new Date(Date.now() + 60000) }]]]) as Error).message), /Invalid or expired/);
  assert.match(String((await run([[/FROM password_reset_otps/i, [{ id: "o1", user_id: "1", otp_hash: h, expires_at: new Date(Date.now() + 60000) }]], [/FROM users WHERE id/i, []]]) as Error).message), /Invalid or expired/);
});
test("resetPassword: bad token / expired / non-super", async () => {
  const { resetPassword } = await load();
  const token = "a".repeat(64);
  const run = async (rules: any, email = SUPER_ADMIN_EMAIL) => { route(rules); const c = reqres({ body: { email, resetToken: token, newPassword: "password1" } }); await resetPassword(c.req, c.res, c.next); return c.getErr(); };
  assert.match(String((await run([], "notsuper@x.com") as Error).message), /Invalid or expired reset token/);
  assert.match(String((await run([[/FROM password_reset_tokens/i, []]]) as Error).message), /Invalid or expired reset token/);
  assert.match(String((await run([[/FROM password_reset_tokens/i, [{ id: "t", user_id: "1", expires_at: new Date(Date.now() - 1000) }]]]) as Error).message), /Invalid or expired reset token/);
});
test("forgotPassword: production SMTP-off reports failed", async () => {
  mailDelivered = false; process.env.NODE_ENV = "production";
  const { forgotPassword } = await load();
  mock.method(console, "error", () => {});
  route([[/FROM users WHERE lower\(email\)/i, [superUserRow]], [/UPDATE|INSERT/i, []]]);
  const c = reqres({ body: { email: SUPER_ADMIN_EMAIL } }); await forgotPassword(c.req, c.res, c.next);
  assert.equal(c.res.body.emailDelivery, "failed");
});
