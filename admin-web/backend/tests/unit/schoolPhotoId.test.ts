import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { isSchoolCapturePhotoId, formatSchoolPhotoId, allocateSchoolPhotoId } from "../../src/utils/schoolPhotoId.ts";

test("isSchoolCapturePhotoId", () => {
  assert.equal(isSchoolCapturePhotoId("ADD_001"), true);
  assert.equal(isSchoolCapturePhotoId("ADD_12"), false); // needs 3+ digits
  assert.equal(isSchoolCapturePhotoId("P1"), false);
  assert.equal(isSchoolCapturePhotoId(null), false);
});
test("formatSchoolPhotoId pads to 3", () => assert.equal(formatSchoolPhotoId(7), "ADD_007"));
test("allocateSchoolPhotoId returns next, throws when school missing", async () => {
  const ok = { query: mock.fn(async (sql: string) => (sql.includes("UPDATE") ? { rows: [{ photo_capture_seq: 4 }] } : { rows: [] })) } as any;
  assert.equal(await allocateSchoolPhotoId(ok, "s1"), "ADD_004");
  const missing = { query: mock.fn(async () => ({ rows: [] })) } as any;
  await assert.rejects(() => allocateSchoolPhotoId(missing, "s1"), /School not found/);
});
