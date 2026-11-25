import { test, mock } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import {
  ownerUserLateralJoin, ownerUsernameSelect, ownerPasswordSelect, findOwnerUserSql,
  assertOwnerPasswordAvailable, allocateOwnerEmail,
} from "../../src/utils/ownerCredentials.ts";

test("SQL builders include the right columns/joins", () => {
  assert.match(ownerUserLateralJoin("s", "school_id"), /u\.school_id = s\.id/);
  assert.match(ownerUsernameSelect("s.owner_username_plain"), /split_part\(owner\.email, '@', 1\)/);
  assert.match(ownerPasswordSelect("s.owner_password_plain"), /owner\.password_plain/);
  assert.match(findOwnerUserSql("institute_id"), /WHERE institute_id = \$1/);
});

const client = (rows: unknown[] | ((sql: string, params: unknown[]) => unknown[])) => ({
  query: mock.fn(async (sql: string, params: unknown[]) => ({ rows: typeof rows === "function" ? rows(sql, params) : rows }) as any),
});

test("assertOwnerPasswordAvailable: blank username/password => no-op", async () => {
  const c = client([]);
  await assertOwnerPasswordAvailable(c as any, "  ", "pw");
  await assertOwnerPasswordAvailable(c as any, "user", "");
  assert.equal(c.query.mock.callCount(), 0);
});
test("assertOwnerPasswordAvailable: matching plain password throws 409", async () => {
  const c = client([{ password_plain: "secret", password_hash: null }]);
  await assert.rejects(() => assertOwnerPasswordAvailable(c as any, "user", "secret"), /already uses that password/);
});
test("assertOwnerPasswordAvailable: matching hashed password throws 409", async () => {
  const hash = await bcrypt.hash("secret", 10);
  const c = client([{ password_plain: null, password_hash: hash }]);
  await assert.rejects(() => assertOwnerPasswordAvailable(c as any, "user", "secret"), /already uses that password/);
});
test("assertOwnerPasswordAvailable: non-matching passes, forwards exclude params", async () => {
  const hash = await bcrypt.hash("other", 10);
  const c = client([{ password_plain: "nope", password_hash: null }, { password_plain: null, password_hash: hash }]);
  await assert.doesNotReject(() => assertOwnerPasswordAvailable(c as any, "user", "secret", { schoolId: "s1", userId: "u1" }));
  assert.deepEqual(c.query.mock.calls[0].arguments[1], ["user", "s1", null, null, "u1"]);
});
test("allocateOwnerEmail: returns preferred when free", async () => {
  const c = client([]);
  assert.equal(await allocateOwnerEmail(c as any, " Owner@School.COM "), "owner@school.com");
});
test("allocateOwnerEmail: appends suffix when taken", async () => {
  let n = 0;
  const c = client(() => (n++ === 0 ? [{ "?column?": 1 }] : []));
  const email = await allocateOwnerEmail(c as any, "owner@school.com");
  assert.match(email, /^owner\+[0-9a-f]{8}@school\.com$/);
});
test("allocateOwnerEmail: no '@' uses teachers.local", async () => {
  let n = 0;
  const c = client(() => (n++ === 0 ? [{ "?column?": 1 }] : []));
  assert.match(await allocateOwnerEmail(c as any, "plainuser"), /^plainuser\+[0-9a-f]{8}@teachers\.local$/);
});
test("allocateOwnerEmail: throws after 5 collisions", async () => {
  const c = client([{ "?column?": 1 }]); // always taken
  await assert.rejects(() => allocateOwnerEmail(c as any, "owner@school.com"), /Could not create a login/);
});
