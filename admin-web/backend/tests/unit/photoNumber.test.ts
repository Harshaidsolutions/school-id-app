import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertPhotoNumberFree } from "../../src/utils/photoNumber.ts";
import { pool } from "../../src/config/database.ts";

afterEach(() => mock.restoreAll());

test("empty photoId => no check", async () => {
  const q = mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assertPhotoNumberFree({ schoolId: "s1" }, "   ");
  assert.equal(q.mock.callCount(), 0);
});
test("no org id => no check", async () => {
  const q = mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assertPhotoNumberFree({}, "P1");
  assert.equal(q.mock.callCount(), 0);
});
test("free number passes (school scope)", async () => {
  const q = mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assert.doesNotReject(() => assertPhotoNumberFree({ schoolId: "s1" }, "P1"));
  assert.match((q.mock.calls[0].arguments[0] as string), /school_id/);
});
test("taken number throws 409 (institute scope)", async () => {
  const q = mock.method(pool, "query", async () => ({ rows: [{ "?column?": 1 }] }) as any);
  await assert.rejects(() => assertPhotoNumberFree({ instituteId: "i1" }, "P1"), /already exists/);
  assert.match((q.mock.calls[0].arguments[0] as string), /institute_id/);
});
