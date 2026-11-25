import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { route, reqres, fakeClient } from "../helpers/testkit.ts";

// ----- pushTokenController (mock SNS seams) -----
let snsArn: string | null = "arn:platform";
let registerArn = "arn:endpoint";
let uploadFails = false;
beforeEach(() => {
  mock.module("../../src/config/sns.ts", { namedExports: { getAndroidPlatformApplicationArn: () => snsArn } });
  mock.module("../../src/utils/snsPush.ts", { namedExports: { registerSnsDeviceEndpoint: async () => registerArn, deactivateSnsEndpoint: async () => {} } });
  mock.module("../../src/utils/idCardPdf.ts", { namedExports: { generateIdCardsPdf: async () => new Uint8Array([1, 2, 3]) } });
  mock.module("../../src/config/storage.ts", { namedExports: { uploadPrintPdfToStorage: async () => { if (uploadFails) throw new Error("upload failed"); return "https://cdn/x.pdf"; } } });
});
afterEach(() => { snsArn = "arn:platform"; registerArn = "arn:endpoint"; uploadFails = false; mock.restoreAll(); });
const push = () => import("../../src/controllers/pushTokenController.ts");
const print = () => import("../../src/controllers/printBatchController.ts");
const FCM = "f".repeat(64);

test("registerTeacherPushToken: auth + token + org validation", async () => {
  const { registerTeacherPushToken } = await push();
  let c = reqres({ user: undefined, body: { pushToken: FCM } });
  await registerTeacherPushToken(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/);
  c = reqres({ user: { userId: "u1" }, body: { pushToken: "short" } });
  await registerTeacherPushToken(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Valid FCM/);
  c = reqres({ user: { userId: "u1" }, body: { pushToken: FCM } });
  await registerTeacherPushToken(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /missing org/);
});
test("registerTeacherPushToken: success with SNS + stale cleanup", async () => {
  const { registerTeacherPushToken } = await push();
  route([[/SELECT id, push_token, sns_endpoint_arn/i, []], [/device_id = \$1/i, [{ id: "old", sns_endpoint_arn: "arn:old" }]], [/INSERT INTO teacher_push_tokens|UPDATE teacher_push_tokens/i, []]]);
  const c = reqres({ user: { userId: "u1", schoolId: "s1" }, body: { pushToken: FCM, deviceId: "dev1" } });
  await registerTeacherPushToken(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.snsRegistered, true);
});
test("registerTeacherPushToken: success without SNS configured", async () => {
  snsArn = null;
  const { registerTeacherPushToken } = await push();
  route([[/SELECT id, push_token/i, []], [/INSERT INTO teacher_push_tokens/i, []]]);
  const c = reqres({ user: { userId: "u1", instituteId: "i1" }, body: { pushToken: FCM } });
  await registerTeacherPushToken(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.snsRegistered, false);
});
test("unregisterTeacherPushToken", async () => {
  const { unregisterTeacherPushToken } = await push();
  let c = reqres({ user: { userId: "u1" }, body: {} });
  await unregisterTeacherPushToken(c.req, c.res, c.next); assert.equal(c.res.body.removed, false);
  route([[/DELETE FROM teacher_push_tokens/i, []]]);
  c = reqres({ user: { userId: "u1" }, body: { pushToken: FCM } });
  await unregisterTeacherPushToken(c.req, c.res, c.next); assert.equal(c.res.body.removed, true);
});
test("loadSnsEndpointsForOrg / deactivatePushEndpoints / loadPushTokensForOrg", async () => {
  const { loadSnsEndpointsForOrg, deactivatePushEndpoints, loadPushTokensForOrg } = await push();
  assert.deepEqual(await loadSnsEndpointsForOrg({}), []);
  route([[/SELECT DISTINCT sns_endpoint_arn/i, [{ sns_endpoint_arn: "a1" }, { sns_endpoint_arn: "a2" }]]]);
  assert.deepEqual(await loadSnsEndpointsForOrg({ schoolId: "s1" }), ["a1", "a2"]);
  const q = route([[/UPDATE teacher_push_tokens/i, []]]);
  await deactivatePushEndpoints([]); assert.equal(q.mock.callCount(), 0);
  await deactivatePushEndpoints(["a1"]); assert.ok(q.mock.callCount() >= 1);
  route([[/push_token FROM teacher_push_tokens/i, [{ push_token: "t1" }]]]);
  assert.deepEqual(await loadPushTokensForOrg({ schoolId: "s1" }), ["t1"]);
  assert.deepEqual(await loadPushTokensForOrg({ instituteId: "i1" }), ["t1"]);
  assert.deepEqual(await loadPushTokensForOrg({}), []);
});

// ----- printBatchController -----
const scope = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]] as any;
test("createPrintBatch: validations", async () => {
  const { createPrintBatch } = await print();
  const run = async (body: unknown, user: unknown = { userId: "a1", role: "admin", schoolId: "s1" }) => { const c = reqres({ body, user }); await createPrintBatch(c.req, c.res, c.next); return c.getErr(); };
  { const c = reqres({ body: {} }); await createPrintBatch(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/); }
  assert.match(String((await run({ studentIds: [] }) as Error).message), /non-empty array/);
  assert.match(String((await run({ studentIds: [" "] }) as Error).message), /non-empty strings/);
});
test("createPrintBatch: not found / multi-school / success / upload failure", async () => {
  const { createPrintBatch } = await print();
  const user = { userId: "a1", role: "admin", schoolId: "s1" };
  // none found
  route([...scope, [/FROM students/i, []]]);
  let c = reqres({ body: { studentIds: ["11111111-1111-4111-8111-111111111111"] }, user });
  await createPrintBatch(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /No students found/);
  // multi-school
  route([...scope, [/FROM students/i, [{ id: "a", school_id: "s1" }, { id: "b", school_id: "s2" }]]]);
  c = reqres({ body: { studentIds: ["a", "b"] }, user });
  await createPrintBatch(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /same school/);
  // success
  mock.method(pool, "connect", async () => fakeClient([[/BEGIN|COMMIT|UPDATE/i, []]]));
  route([...scope, [/FROM students/i, [{ id: "a", school_id: "s1", name: "A" }]], [/INSERT INTO print_batches/i, [{ id: "pb1" }]], [/UPDATE print_batches/i, []]]);
  c = reqres({ body: { studentIds: ["a"] }, user });
  await createPrintBatch(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.body.printBatchId, "pb1"); assert.equal(c.res.body.pdfUrl, "https://cdn/x.pdf");
  // upload failure marks failed + rethrows
  uploadFails = true;
  route([...scope, [/FROM students/i, [{ id: "a", school_id: "s1", name: "A" }]], [/INSERT INTO print_batches/i, [{ id: "pb2" }]], [/UPDATE print_batches/i, []]]);
  c = reqres({ body: { studentIds: ["a"] }, user });
  await createPrintBatch(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /upload failed/);
});
test("listPrintBatches", async () => {
  const { listPrintBatches } = await print();
  let c = reqres({ params: {}, user: { userId: "a1", role: "admin" } });
  await listPrintBatches(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /schoolId is required/);
  route([...scope, [/FROM print_batches/i, [{ id: "pb1", school_id: "s1", student_ids: ["a", "b"], pdf_url: "u", status: "completed", created_by: "a1", created_at: "t" }]]]);
  c = reqres({ params: { schoolId: "s1" }, user: { userId: "a1", role: "admin" } });
  await listPrintBatches(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none"); assert.equal(c.res.body.printBatches[0].studentCount, 2);
});
