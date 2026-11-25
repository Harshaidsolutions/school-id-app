import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { isInstituteCapturePhotoId, formatInstitutePhotoId, allocateInstitutePhotoId } from "../../src/utils/institutePhotoId.ts";

test("isInstituteCapturePhotoId", () => {
  assert.equal(isInstituteCapturePhotoId("ADD_999"), true);
  assert.equal(isInstituteCapturePhotoId("ADD_9"), false);
  assert.equal(isInstituteCapturePhotoId(undefined), false);
});
test("formatInstitutePhotoId", () => assert.equal(formatInstitutePhotoId(3), "ADD_003"));
test("allocateInstitutePhotoId", async () => {
  const ok = { query: mock.fn(async (sql: string) => (sql.includes("UPDATE") ? { rows: [{ photo_capture_seq: 11 }] } : { rows: [] })) } as any;
  assert.equal(await allocateInstitutePhotoId(ok, "i1"), "ADD_011");
  const missing = { query: mock.fn(async () => ({ rows: [] })) } as any;
  await assert.rejects(() => allocateInstitutePhotoId(missing, "i1"), /Institute not found/);
});
