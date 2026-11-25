import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EndpointDisabledException, InvalidParameterException } from "@aws-sdk/client-sns";

// Controllable seams for the mocked config/sns module.
let sendImpl: (...a: unknown[]) => Promise<unknown> = async () => ({});
let platformArn: string | null = "arn:platform";

mock.module("../../src/config/sns.ts", {
  namedExports: {
    getSnsClient: () => ({ send: (...a: unknown[]) => sendImpl(...a) }),
    getAndroidPlatformApplicationArn: () => platformArn,
    requireAndroidPlatformApplicationArn: () => {
      if (!platformArn) throw new Error("SNS_ANDROID_PLATFORM_ARN must be configured");
      return platformArn;
    },
  },
});

const load = () => import("../../src/utils/snsPush.ts");
afterEach(() => { sendImpl = async () => ({}); platformArn = "arn:platform"; mock.restoreAll(); });

test("buildGcmMessage: data-only with image + extra data + tag", async () => {
  const { buildGcmMessage } = await load();
  const msg = JSON.parse(buildGcmMessage({ title: "T", body: "B", imageUrl: " http://x/y.png ", data: { notificationId: "n1", k: "v" } }));
  assert.equal(msg.priority, "high");
  assert.equal(msg.data.title, "T");
  assert.equal(msg.data.message, "B");
  assert.equal(msg.data.imageUrl, "http://x/y.png");
  assert.equal(msg.data.image, "http://x/y.png");
  assert.equal(msg.data.k, "v");
  assert.equal(msg.data.tag, "admin-notification-n1");
});
test("buildGcmMessage: no image", async () => {
  const { buildGcmMessage } = await load();
  assert.equal(JSON.parse(buildGcmMessage({ title: "T", body: "B" })).data.imageUrl, undefined);
});
test("registerSnsDeviceEndpoint: refresh existing", async () => {
  const { registerSnsDeviceEndpoint } = await load();
  let n = 0; sendImpl = async () => { n++; return {}; };
  assert.equal(await registerSnsDeviceEndpoint("tok", { existingEndpointArn: "arn:existing", customUserData: "u" }), "arn:existing");
  assert.equal(n, 1);
});
test("registerSnsDeviceEndpoint: create new (trimmed)", async () => {
  const { registerSnsDeviceEndpoint } = await load();
  sendImpl = async () => ({ EndpointArn: "arn:new " });
  assert.equal(await registerSnsDeviceEndpoint("tok", { customUserData: "u" }), "arn:new");
});
test("registerSnsDeviceEndpoint: no ARN throws", async () => {
  const { registerSnsDeviceEndpoint } = await load();
  sendImpl = async () => ({});
  await assert.rejects(() => registerSnsDeviceEndpoint("tok"), /did not return an endpoint ARN/);
});
test("registerSnsDeviceEndpoint: recovers ARN from InvalidParameterException", async () => {
  const { registerSnsDeviceEndpoint } = await load();
  let n = 0;
  const err = new InvalidParameterException({ message: "Endpoint arn:aws:sns:us-east-1:1:endpoint/x already exists", $metadata: {} });
  sendImpl = async () => { if (n++ === 0) throw err; return {}; };
  assert.match(await registerSnsDeviceEndpoint("tok"), /^arn:aws:sns:/);
});
test("registerSnsDeviceEndpoint: rethrows other errors", async () => {
  const { registerSnsDeviceEndpoint } = await load();
  sendImpl = async () => { throw new Error("boom"); };
  await assert.rejects(() => registerSnsDeviceEndpoint("tok"), /boom/);
});
test("deactivate/delete swallow errors", async () => {
  const { deactivateSnsEndpoint, deleteSnsEndpoint } = await load();
  mock.method(console, "warn", () => {});
  sendImpl = async () => { throw new Error("x"); };
  await assert.doesNotReject(() => deactivateSnsEndpoint("arn"));
  await assert.doesNotReject(() => deleteSnsEndpoint("arn"));
});
test("sendSnsPushNotifications: no platform arn => skip", async () => {
  const { sendSnsPushNotifications } = await load();
  platformArn = null;
  mock.method(console, "warn", () => {});
  assert.deepEqual(await sendSnsPushNotifications(["a"], { title: "t", body: "b" }), { sent: 0, failed: 0, disabledEndpointArns: [] });
});
test("sendSnsPushNotifications: empty list => skip", async () => {
  const { sendSnsPushNotifications } = await load();
  assert.deepEqual(await sendSnsPushNotifications([" "], { title: "t", body: "b" }), { sent: 0, failed: 0, disabledEndpointArns: [] });
});
test("sendSnsPushNotifications: counts sent/failed/disabled", async () => {
  const { sendSnsPushNotifications } = await load();
  mock.method(console, "warn", () => {});
  mock.method(console, "error", () => {});
  const disabled = new EndpointDisabledException({ message: "disabled", $metadata: {} });
  const invalidDisabled = new InvalidParameterException({ message: "endpoint is disabled", $metadata: {} });
  let i = 0;
  sendImpl = async () => { i++; if (i === 2) throw disabled; if (i === 3) throw new Error("other"); if (i === 4) throw invalidDisabled; return {}; };
  const r = await sendSnsPushNotifications(["a", "b", "c", "d"], { title: "t", body: "b" });
  assert.equal(r.sent, 1); assert.equal(r.failed, 3); assert.deepEqual(r.disabledEndpointArns, ["b", "d"]);
});
