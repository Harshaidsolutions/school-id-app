import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseBulkIds, bulkResourceId, requireAdminEmail, MAX_BULK } from "../../src/utils/bulkIds.ts";
import { pool } from "../../src/config/database.ts";

afterEach(() => mock.restoreAll());
const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-9222-222222222222";

test("parseBulkIds: not array throws", () => assert.throws(() => parseBulkIds("x", "student"), /ids are required/));
test("parseBulkIds: empty throws", () => assert.throws(() => parseBulkIds([], "student"), /at least one/));
test("parseBulkIds: dedupes + trims, keeps valid uuids", () => {
  assert.deepEqual(parseBulkIds([UUID, ` ${UUID} `, UUID2], "student"), [UUID, UUID2]);
});
test("parseBulkIds: too many throws", () => {
  assert.throws(() => parseBulkIds(Array.from({ length: MAX_BULK + 1 }, (_, i) => `${i}`), "student"), /or fewer/);
});
test("parseBulkIds: invalid uuid throws", () => assert.throws(() => parseBulkIds(["not-a-uuid"], "member"), /Invalid member id/));
test("bulkResourceId: stable, order-independent", () => {
  assert.equal(bulkResourceId([UUID, UUID2]), bulkResourceId([UUID2, UUID]));
  assert.match(bulkResourceId([UUID]), /^bulk:1:[0-9a-f]{64}$/);
});
test("requireAdminEmail: returns email when present", async () => {
  mock.method(pool, "query", async () => ({ rows: [{ email: "a@b.com" }] }) as any);
  assert.equal(await requireAdminEmail("admin-1"), "a@b.com");
});
test("requireAdminEmail: throws when missing", async () => {
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assert.rejects(() => requireAdminEmail("admin-1"), /email is required/);
});
