import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  SUPER_ADMIN_EMAIL, isPrimarySuperAdminEmail, userMayUseAdminPasswordReset, resolveIsSuperAdmin,
  queryAdminSeesAllOrganizations, loadAdminScope, adminSeesAllOrganizations, requireAdminScope,
  requireSuperAdmin, schoolOwnerSql, assertSchoolOwnedByAdmin, assertStudentOwnedByAdmin,
  assertInstituteOwnedByAdmin, adminCatalogOwnerSql, assertCatalogRowOwnedByAdmin,
  loadOrgOwnerAdminId, assertNotificationOwnedByAdmin,
} from "../../src/utils/adminScope.ts";
import { pool } from "../../src/config/database.ts";

afterEach(() => mock.restoreAll());
const rows = (r: unknown[]) => mock.method(pool, "query", async () => ({ rows: r }) as any);
const req = (user: unknown) => ({ user }) as any;

test("isPrimarySuperAdminEmail", () => {
  assert.equal(isPrimarySuperAdminEmail(` ${SUPER_ADMIN_EMAIL.toUpperCase()} `), true);
  assert.equal(isPrimarySuperAdminEmail("x@y.com"), false);
});
test("resolveIsSuperAdmin accepts various db truthy", () => {
  for (const v of [true, 1, "t", "true"]) assert.equal(resolveIsSuperAdmin({ role: "admin", is_super_admin: v as any }), true, String(v));
  assert.equal(resolveIsSuperAdmin({ role: "admin", is_super_admin: false }), false);
  assert.equal(resolveIsSuperAdmin({ role: "teacher", is_super_admin: true }), false);
});
test("userMayUseAdminPasswordReset", () => {
  assert.equal(userMayUseAdminPasswordReset({ role: "admin", email: SUPER_ADMIN_EMAIL, is_super_admin: true }), true);
  assert.equal(userMayUseAdminPasswordReset({ role: "admin", email: "x@y.com", is_super_admin: true }), false);
  assert.equal(userMayUseAdminPasswordReset({ role: "teacher", email: SUPER_ADMIN_EMAIL }), false);
});
test("queryAdminSeesAllOrganizations", async () => {
  rows([{ see_all: true }]);
  assert.equal(await queryAdminSeesAllOrganizations("a1"), true);
  rows([]);
  assert.equal(await queryAdminSeesAllOrganizations("a1"), false);
});
test("loadAdminScope: found / not found", async () => {
  rows([{ is_super_admin: true }]);
  assert.deepEqual(await loadAdminScope("a1"), { adminUserId: "a1", isSuperAdmin: true });
  rows([]);
  await assert.rejects(() => loadAdminScope("a1"), /Admin account not found/);
});
test("adminSeesAllOrganizations: super short-circuits; scoped queries", async () => {
  assert.equal(await adminSeesAllOrganizations({ adminUserId: "a1", isSuperAdmin: true }, req({})), true);
  rows([{ see_all: false }]);
  assert.equal(await adminSeesAllOrganizations({ adminUserId: "a1", isSuperAdmin: false }, req({})), false);
});
test("requireAdminScope: rejects non-admin, loads for admin", async () => {
  await assert.rejects(() => requireAdminScope(req({ role: "teacher", userId: "t" })), /Admin access required/);
  await assert.rejects(() => requireAdminScope(req(undefined)), /Admin access required/);
  rows([{ is_super_admin: false }]);
  assert.deepEqual(await requireAdminScope(req({ role: "admin", userId: "a1" })), { adminUserId: "a1", isSuperAdmin: false });
});
test("requireSuperAdmin", async () => {
  rows([{ is_super_admin: true }]);
  assert.equal((await requireSuperAdmin(req({ role: "admin", userId: "a1" }))).isSuperAdmin, true);
  rows([{ is_super_admin: false }]);
  await assert.rejects(() => requireSuperAdmin(req({ role: "admin", userId: "a1" })), /Super admin access required/);
});
test("schoolOwnerSql / adminCatalogOwnerSql", () => {
  assert.deepEqual(schoolOwnerSql({ adminUserId: "a1", isSuperAdmin: true }, 3), { clause: "", value: null });
  assert.deepEqual(schoolOwnerSql({ adminUserId: "a1", isSuperAdmin: false }, 3), { clause: " AND s.owner_admin_id = $3", value: "a1" });
  assert.deepEqual(adminCatalogOwnerSql({ adminUserId: "a1", isSuperAdmin: false }, "t", 2), { clause: " AND t.owner_admin_id = $2", value: "a1" });
});
test("assertSchoolOwnedByAdmin: super passes; owned passes; else 404", async () => {
  await assert.doesNotReject(() => assertSchoolOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: true }, "s1"));
  rows([{ id: "s1" }]);
  await assert.doesNotReject(() => assertSchoolOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, "s1"));
  rows([]);
  await assert.rejects(() => assertSchoolOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, "s1"), /School not found/);
});
test("assertInstituteOwnedByAdmin", async () => {
  await assert.doesNotReject(() => assertInstituteOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: true }, "i1"));
  rows([]);
  await assert.rejects(() => assertInstituteOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, "i1"), /Institute not found/);
});
test("assertStudentOwnedByAdmin: school / institute / neither", async () => {
  rows([{ id: "s1" }]);
  await assert.doesNotReject(() => assertStudentOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, { school_id: "s1" }));
  rows([{ id: "i1" }]);
  await assert.doesNotReject(() => assertStudentOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, { institute_id: "i1" }));
  await assert.rejects(() => assertStudentOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, {}), /Student not found/);
});
test("assertCatalogRowOwnedByAdmin: missing / wrong owner / ok", async () => {
  rows([]);
  await assert.rejects(() => assertCatalogRowOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, "templates", "r1"), /Item not found/);
  rows([{ owner_admin_id: "other" }]);
  await assert.rejects(() => assertCatalogRowOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, "templates", "r1"), /Item not found/);
  rows([{ owner_admin_id: "a1" }]);
  await assert.doesNotReject(() => assertCatalogRowOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, "catalog_items", "r1"));
});
test("loadOrgOwnerAdminId", async () => {
  rows([{ owner_admin_id: "a1" }]);
  assert.equal(await loadOrgOwnerAdminId("schools", "s1"), "a1");
  rows([]);
  assert.equal(await loadOrgOwnerAdminId("institutes", "i1"), null);
});
test("assertNotificationOwnedByAdmin: seeAll passes; else owned/404", async () => {
  await assert.doesNotReject(() => assertNotificationOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, true, "n1"));
  rows([{ id: "n1" }]);
  await assert.doesNotReject(() => assertNotificationOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, false, "n1"));
  rows([]);
  await assert.rejects(() => assertNotificationOwnedByAdmin({ adminUserId: "a1", isSuperAdmin: false }, false, "n1"), /Notification not found/);
});
