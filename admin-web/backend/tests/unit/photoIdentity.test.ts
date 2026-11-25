import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isPhotoIdentityLabel, chooseCanonicalPhotoId, withCanonicalPhotoId, persistCanonicalPhotoIds } from "../../src/utils/photoIdentity.ts";
import { pool } from "../../src/config/database.ts";

afterEach(() => mock.restoreAll());

test("isPhotoIdentityLabel", () => {
  for (const l of ["ID", "Photo ID", "Photo Number", "Photo No", "Photo Id Number"]) assert.equal(isPhotoIdentityLabel(l), true, l);
  assert.equal(isPhotoIdentityLabel("Photo URL"), false);
  assert.equal(isPhotoIdentityLabel("Captured Photo"), false);
  assert.equal(isPhotoIdentityLabel("Student Name"), false);
  assert.equal(isPhotoIdentityLabel("  "), false);
  assert.equal(isPhotoIdentityLabel("Photo"), false); // just 'photo' has no id/number/no
});
test("chooseCanonicalPhotoId: stored real id wins over generated", () => {
  assert.equal(chooseCanonicalPhotoId("P100", {}, {}), "P100");
  assert.equal(chooseCanonicalPhotoId("ADD_12", { fld_0: "P7" }, { fld_0: "Photo Number" }), "P7");
});
test("chooseCanonicalPhotoId: numbered beats other", () => {
  assert.equal(chooseCanonicalPhotoId("ADD_1", { fld_0: "X1", fld_1: "N9" }, { fld_0: "Photo ID", fld_1: "Photo Number" }), "N9");
});
test("chooseCanonicalPhotoId: generated-only falls back to stored or null", () => {
  assert.equal(chooseCanonicalPhotoId("ADD_3", {}, {}), "ADD_3");
  assert.equal(chooseCanonicalPhotoId(null, {}, {}), null);
  assert.equal(chooseCanonicalPhotoId("ADD_3", { fld_0: "IMP-9" }, { fld_0: "Photo ID" }), "ADD_3"); // generated value skipped
});
test("withCanonicalPhotoId: no identity => unchanged, no persist", () => {
  const row = { id: "1", photo_id: null, extra_fields: {}, field_labels: {} };
  const r = withCanonicalPhotoId(row as any);
  assert.equal(r.persist, null);
});
test("withCanonicalPhotoId: unifies extra + schedules persist for generated stored", () => {
  const row = { id: "1", photo_id: "ADD_5", extra_fields: { fld_0: "ADD_5" }, field_labels: { fld_0: "Photo Number" } };
  const r = withCanonicalPhotoId({ ...row, extra_fields: { fld_0: "P42" } } as any);
  assert.equal(r.row.photo_id, "P42");
  assert.deepEqual(r.persist, { id: "1", photoId: "P42" });
});
test("withCanonicalPhotoId: rewrites a differing identity-labeled extra key", () => {
  const r = withCanonicalPhotoId({ id: "9", photo_id: "ADD_5", extra_fields: { fld_0: "P42", fld_1: "ADD_5" }, field_labels: { fld_0: "Photo Number", fld_1: "Photo ID" } } as any);
  assert.equal(r.row.photo_id, "P42");
  assert.equal((r.row.extra_fields as any).fld_1, "P42");
});
test("withCanonicalPhotoId: real stored id, no persist", () => {
  const r = withCanonicalPhotoId({ id: "1", photo_id: "P42", extra_fields: { fld_0: "P42" }, field_labels: { fld_0: "Photo Number" } } as any);
  assert.equal(r.persist, null);
  assert.equal(r.row.photo_id, "P42");
});
test("persistCanonicalPhotoIds: empty => no query; writes otherwise", async () => {
  const q = mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await persistCanonicalPhotoIds([]);
  assert.equal(q.mock.callCount(), 0);
  await persistCanonicalPhotoIds([{ id: "1", photoId: "P1" }, { id: "2", photoId: "P2" }]);
  assert.equal(q.mock.callCount(), 1);
  assert.deepEqual(q.mock.calls[0].arguments[1], [["1", "2"], ["P1", "P2"]]);
});
