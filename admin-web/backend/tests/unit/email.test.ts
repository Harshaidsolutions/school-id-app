import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";

let lastTransport: any = null;
let lastSendMail: any = null;
mock.module("nodemailer", {
  defaultExport: {
    createTransport: (cfg: any) => { lastTransport = cfg; return { sendMail: async (m: any) => { lastSendMail = m; return {}; } }; },
  },
});
const load = () => import("../../src/utils/email.ts");
const SMTP = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_PORT", "SMTP_SECURE"];
afterEach(() => { for (const k of SMTP) delete process.env[k]; lastTransport = null; lastSendMail = null; });

test("sendEmail: SMTP not configured => delivered false", async () => {
  const { sendEmail } = await load();
  assert.deepEqual(await sendEmail({ to: "a@b.com", subject: "s", text: "t" }), { delivered: false, smtpConfigured: false });
});
test("sendEmail: configured default port 587 (insecure)", async () => {
  Object.assign(process.env, { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "f@x.com" });
  const { sendEmail } = await load();
  const r = await sendEmail({ to: "a@b.com", subject: "s", text: "t", html: "<p>h</p>" });
  assert.deepEqual(r, { delivered: true, smtpConfigured: true });
  assert.equal(lastTransport.port, 587);
  assert.equal(lastTransport.secure, false);
  assert.equal(lastSendMail.from, "f@x.com");
  assert.equal(lastSendMail.html, "<p>h</p>");
});
test("sendEmail: port 465 => secure true", async () => {
  Object.assign(process.env, { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "f@x.com", SMTP_PORT: "465" });
  const { sendEmail } = await load();
  await sendEmail({ to: "a@b.com", subject: "s", text: "t" });
  assert.equal(lastTransport.secure, true);
});
test("sendEmail: SMTP_SECURE=true forces secure", async () => {
  Object.assign(process.env, { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "f@x.com", SMTP_SECURE: "true" });
  const { sendEmail } = await load();
  await sendEmail({ to: "a@b.com", subject: "s", text: "t" });
  assert.equal(lastTransport.secure, true);
});
