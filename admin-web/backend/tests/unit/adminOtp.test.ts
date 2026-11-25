import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";

let mailDelivered = true;
mock.module("../../src/utils/email.ts", {
  namedExports: { sendEmail: async () => ({ delivered: mailDelivered, smtpConfigured: mailDelivered }) },
});
mock.module("../../src/middleware/attemptLimit.ts", {
  namedExports: { consumeAttempt: () => {} },
});
const load = () => import("../../src/utils/adminOtp.ts");
afterEach(() => { mailDelivered = true; delete process.env.NODE_ENV; mock.restoreAll(); });

test("generateOtp: 6 digits", async () => {
  const { generateOtp } = await load();
  for (let i = 0; i < 20; i++) assert.match(generateOtp(), /^\d{6}$/);
});
test("requestAdminActionOtp: emailed path", async () => {
  const { requestAdminActionOtp } = await load();
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  const r = await requestAdminActionOtp({ adminUserId: "a1", adminEmail: "a@b.com", actionType: "del", resourceId: "r1", emailSubject: "S", emailIntro: "Intro", logPrefix: "[t]" });
  assert.equal(r.emailDelivery, "sent");
  assert.equal(r.devOtp, undefined);
});
test("requestAdminActionOtp: dev logged path when SMTP off and not prod", async () => {
  mailDelivered = false; process.env.NODE_ENV = "development";
  const { requestAdminActionOtp } = await load();
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  mock.method(console, "log", () => {});
  const r = await requestAdminActionOtp({ adminUserId: "a1", adminEmail: "a@b.com", actionType: "del", resourceId: "r1", emailSubject: "S", emailIntro: "Intro", logPrefix: "[t]" });
  assert.equal(r.emailDelivery, "logged");
  assert.match(r.devOtp as string, /^\d{6}$/);
});
test("requestAdminActionOtp: failed in production when SMTP off", async () => {
  mailDelivered = false; process.env.NODE_ENV = "production";
  const { requestAdminActionOtp } = await load();
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  mock.method(console, "error", () => {});
  const r = await requestAdminActionOtp({ adminUserId: "a1", adminEmail: "a@b.com", actionType: "del", resourceId: "r1", emailSubject: "S", emailIntro: "Intro", logPrefix: "[t]" });
  assert.equal(r.emailDelivery, "failed");
  assert.equal(r.devOtp, undefined);
});
test("verifyAdminActionOtp: bad format / missing / expired / mismatch / success", async () => {
  const bcrypt = (await import("bcrypt")).default;
  const { verifyAdminActionOtp } = await load();
  await assert.rejects(() => verifyAdminActionOtp({ adminUserId: "a1", actionType: "del", resourceId: "r1", otp: "abc" }), /valid 6-digit/);

  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assert.rejects(() => verifyAdminActionOtp({ adminUserId: "a1", actionType: "del", resourceId: "r1", otp: "123456" }), /Invalid or expired/);

  const hash = await bcrypt.hash("123456", 10);
  mock.method(pool, "query", async () => ({ rows: [{ id: "o1", otp_hash: hash, expires_at: new Date(Date.now() - 1000) }] }) as any);
  await assert.rejects(() => verifyAdminActionOtp({ adminUserId: "a1", actionType: "del", resourceId: "r1", otp: "123456" }), /Invalid or expired/);

  mock.method(pool, "query", async () => ({ rows: [{ id: "o1", otp_hash: hash, expires_at: new Date(Date.now() + 60000) }] }) as any);
  await assert.rejects(() => verifyAdminActionOtp({ adminUserId: "a1", actionType: "del", resourceId: "r1", otp: "999999" }), /Invalid or expired/);

  let calls = 0;
  mock.method(pool, "query", async () => { calls++; return { rows: [{ id: "o1", otp_hash: hash, expires_at: new Date(Date.now() + 60000) }] } as any; });
  await assert.doesNotReject(() => verifyAdminActionOtp({ adminUserId: "a1", actionType: "del", resourceId: "r1", otp: "123456" }));
  assert.ok(calls >= 2); // select + update consume
});
