import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import { assertTeacherOrgActive, requireActiveTeacherOrg, SCHOOL_INACTIVE_MSG, INSTITUTE_INACTIVE_MSG } from "../../src/middleware/orgAccess.ts";

afterEach(() => mock.restoreAll());

test("assertTeacherOrgActive: known school flag", async () => {
  await assert.doesNotReject(() => assertTeacherOrgActive({ schoolId: "s1", schoolIsActive: true }));
  await assert.rejects(() => assertTeacherOrgActive({ schoolId: "s1", schoolIsActive: false }), new RegExp(SCHOOL_INACTIVE_MSG));
});
test("assertTeacherOrgActive: school lookup (found active / inactive / missing)", async () => {
  mock.method(pool, "query", async () => ({ rows: [{ is_active: true }] }) as any);
  await assert.doesNotReject(() => assertTeacherOrgActive({ schoolId: "s1" }));
  mock.method(pool, "query", async () => ({ rows: [{ is_active: false }] }) as any);
  await assert.rejects(() => assertTeacherOrgActive({ schoolId: "s1" }), new RegExp(SCHOOL_INACTIVE_MSG));
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assert.rejects(() => assertTeacherOrgActive({ schoolId: "s1" }), /School not found/);
});
test("assertTeacherOrgActive: institute path", async () => {
  await assert.doesNotReject(() => assertTeacherOrgActive({ instituteId: "i1", instituteIsActive: true }));
  mock.method(pool, "query", async () => ({ rows: [{ is_active: true }] }) as any);
  await assert.doesNotReject(() => assertTeacherOrgActive({ instituteId: "i1" }));
  mock.restoreAll();
  await assert.rejects(() => assertTeacherOrgActive({ instituteId: "i1", instituteIsActive: false }), new RegExp(INSTITUTE_INACTIVE_MSG));
  mock.method(pool, "query", async () => ({ rows: [{ is_active: false }] }) as any);
  await assert.rejects(() => assertTeacherOrgActive({ instituteId: "i1" }), new RegExp(INSTITUTE_INACTIVE_MSG));
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  await assert.rejects(() => assertTeacherOrgActive({ instituteId: "i1" }), /Institute not found/);
});
test("assertTeacherOrgActive: unlinked throws", async () => {
  await assert.rejects(() => assertTeacherOrgActive({}), /not linked to a school or institute/);
});
const run = async (user: unknown) => { let e: unknown = "none"; await requireActiveTeacherOrg({ user } as any, {} as any, ((x?: unknown) => { e = x; }) as any); return e; };
test("requireActiveTeacherOrg: non-teacher passes through", async () => {
  assert.equal(await run({ role: "admin" }), undefined);
  assert.equal(await run(undefined), undefined);
});
test("requireActiveTeacherOrg: organization_staff active/inactive/unlinked", async () => {
  assert.match(String((await run({ role: "organization_staff" }) as Error).message), /not linked to an organization/);
  mock.method(pool, "query", async () => ({ rows: [{ is_active: true }] }) as any);
  assert.equal(await run({ role: "organization_staff", organizationId: "o1" }), undefined);
  mock.method(pool, "query", async () => ({ rows: [{ is_active: false }] }) as any);
  assert.match(String((await run({ role: "organization_staff", organizationId: "o1" }) as Error).message), /inactive/);
});
test("requireActiveTeacherOrg: teacher with active school passes", async () => {
  mock.method(pool, "query", async () => ({ rows: [{ is_active: true }] }) as any);
  assert.equal(await run({ role: "teacher", schoolId: "s1" }), undefined);
});
