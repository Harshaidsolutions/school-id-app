import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendExpoPushNotifications } from "../../src/utils/expoPush.ts";

afterEach(() => mock.restoreAll());

test("no valid tokens => no fetch", async () => {
  const f = mock.method(globalThis, "fetch", async () => new Response("{}"));
  await sendExpoPushNotifications(["bad", "alsoBad"], { title: "t", body: "b" });
  assert.equal(f.mock.callCount(), 0);
});
test("chunks in batches of 100", async () => {
  const calls: unknown[] = [];
  mock.method(globalThis, "fetch", async (_url: string, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}"); });
  const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`);
  await sendExpoPushNotifications(tokens, { title: "t", body: "b", data: { k: "v" } });
  assert.equal(calls.length, 2);
  assert.equal((calls[0] as unknown[]).length, 100);
  assert.equal((calls[1] as unknown[]).length, 50);
});
test("swallows fetch errors", async () => {
  mock.method(globalThis, "fetch", async () => { throw new Error("network"); });
  mock.method(console, "error", () => {});
  await assert.doesNotReject(() => sendExpoPushNotifications(["ExponentPushToken[1]"], { title: "t", body: "b" }));
});
