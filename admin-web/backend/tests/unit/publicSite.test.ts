import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

let mailDelivered = true;
let mailThrows = false;
beforeEach(() => {
  mock.module("../../src/utils/email.ts", { namedExports: { sendEmail: async () => { if (mailThrows) throw new Error("smtp"); return { delivered: mailDelivered, smtpConfigured: true }; } } });
});
afterEach(() => { mailDelivered = true; mailThrows = false; mock.restoreAll(); });
const load = () => import("../../src/controllers/publicSiteController.ts");

test("getPublicShowcase: merges + sorts orgs, maps brochures", async () => {
  route([
    [/FROM schools/i, [{ name: "Zeta School", logo_url: " l1 " }]],
    [/FROM institutes/i, [{ name: "Alpha Institute", logo_url: null }]],
    [/kind = 'brochure'/i, [{ name: " Catalog ", image_url: "u" }]],
  ]);
  const c = reqres({});
  (c.res as any).set = () => c.res;
  const { getPublicShowcase } = await load();
  await getPublicShowcase(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.deepEqual(c.res.body.schools.map((s: any) => s.name), ["Alpha Institute", "Zeta School"]);
  assert.equal(c.res.body.brochures[0].fileUrl, "u");
});

test("submitPublicEnquiry: validations", async () => {
  const { submitPublicEnquiry } = await load();
  const run = async (body: unknown, ip = `ip-${Math.random()}`) => { const c = reqres({ body }); c.req.ip = ip; await submitPublicEnquiry(c.req, c.res, c.next); return c.getErr(); };
  assert.match(String((await run({ name: "x", phone: "1234567890" }) as Error).message), /Enter your name/);
  assert.match(String((await run({ name: "Valid Name", phone: "123" }) as Error).message), /valid phone/);
  assert.match(String((await run({ name: "Valid Name", phone: "1234567890", email: "bad" }) as Error).message), /valid email/);
  assert.match(String((await run({ name: "Valid Name", phone: "1234567890", message: "x".repeat(2001) }) as Error).message), /shorter message/);
});
test("submitPublicEnquiry: success / not delivered / throw / rate limit", async () => {
  const { submitPublicEnquiry } = await load();
  const good = { name: "Valid Name", phone: "1234567890", email: "a@b.com", message: "hi" };
  let c = reqres({ body: good }); c.req.ip = "ipA";
  await submitPublicEnquiry(c.req, c.res, c.next); assert.equal(c.res.body.status, "ok");
  mailDelivered = false;
  c = reqres({ body: good }); c.req.ip = "ipB";
  await submitPublicEnquiry(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /could not be sent/);
  mailDelivered = true; mailThrows = true;
  mock.method(console, "error", () => {});
  c = reqres({ body: good }); c.req.ip = "ipC";
  await submitPublicEnquiry(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /could not be sent/);
  mailThrows = false;
  for (let i = 0; i < 5; i++) { c = reqres({ body: good }); c.req.ip = "ipD"; await submitPublicEnquiry(c.req, c.res, c.next); }
  c = reqres({ body: good }); c.req.ip = "ipD";
  await submitPublicEnquiry(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /wait a few minutes/);
});
