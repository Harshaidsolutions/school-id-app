import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/config/database.ts";
import {
  DEFAULT_SEED_FIELDS, seedDefaultFormConfig, persistFormConfigFields, clearFormConfigForOrg,
  groupFieldKeyForOrg, ensureFormConfigForOrg, backfillFormConfigForOrg, loadFormConfigForOrg,
  getFormConfig, putFormConfig, syncFormConfig, syncFormConfigFromExcelFields, syncFormConfigFromExcelHeaders,
} from "../../src/controllers/formConfigController.ts";

afterEach(() => mock.restoreAll());

// Programmable query router: array of [fragment, rowsOrFn].
type Rule = [RegExp, unknown[] | ((sql: string, p: unknown[]) => unknown[]) ];
function route(rules: Rule[], fallback: unknown[] = []) {
  return mock.method(pool, "query", async (sql: string, params: unknown[] = []) => {
    for (const [re, rows] of rules) if (re.test(sql)) {
      const r = typeof rows === "function" ? rows(sql, params) : rows;
      return { rows: r, rowCount: r.length } as any;
    }
    return { rows: fallback, rowCount: fallback.length } as any;
  });
}
const adminRow = [{ is_super_admin: true }];
const scopeRules: Rule[] = [[/FROM users WHERE id/i, adminRow], [/FROM schools WHERE id = \$1 AND owner_admin_id/i, [{ id: "s1" }]]];

test("DEFAULT_SEED_FIELDS shape: photo+name visible, signature hidden, none required", () => {
  assert.deepEqual(DEFAULT_SEED_FIELDS.map((f) => f.key), ["photo_id", "student_name", "signature_upload"]);
  assert.equal(DEFAULT_SEED_FIELDS.find((f) => f.key === "signature_upload")!.enabled, false);
  assert.ok(DEFAULT_SEED_FIELDS.every((f) => f.required === false));
});

test("persistFormConfigFields: update when row exists (school)", async () => {
  const q = route([[/UPDATE form_configs/i, [{ id: "c1" }]]]);
  await persistFormConfigFields({ schoolId: "s1" }, DEFAULT_SEED_FIELDS);
  assert.ok(q.mock.calls.some((c) => /UPDATE form_configs/.test(c.arguments[0] as string)));
  assert.ok(!q.mock.calls.some((c) => /INSERT INTO form_configs/.test(c.arguments[0] as string)));
});
test("persistFormConfigFields: insert when no row (institute)", async () => {
  const q = route([[/UPDATE form_configs/i, []]]);
  await persistFormConfigFields({ instituteId: "i1" }, DEFAULT_SEED_FIELDS);
  assert.ok(q.mock.calls.some((c) => /INSERT INTO form_configs/.test(c.arguments[0] as string)));
});
test("seedDefaultFormConfig: swallows errors", async () => {
  mock.method(console, "error", () => {});
  mock.method(pool, "query", async () => { throw new Error("db"); });
  await assert.doesNotReject(() => seedDefaultFormConfig({ schoolId: "s1" }));
});
test("clearFormConfigForOrg", async () => {
  const q = route([[/DELETE FROM form_configs/i, []]]);
  await clearFormConfigForOrg({ schoolId: "s1" });
  await clearFormConfigForOrg({ instituteId: "i1" });
  assert.equal(q.mock.callCount(), 2);
  await clearFormConfigForOrg({}); // neither -> no-op path
});
test("groupFieldKeyForOrg", async () => {
  route([[/SELECT fields FROM form_configs/i, [{ fields: [{ key: "fld_1", label: "Group", enabled: true, isGroup: true }] }]]]);
  assert.equal(await groupFieldKeyForOrg({ schoolId: "s1" }), "fld_1");
  route([[/SELECT fields FROM form_configs/i, [{ fields: [] }]]]);
  assert.equal(await groupFieldKeyForOrg({ schoolId: "s1" }), null);
  assert.equal(await groupFieldKeyForOrg({}), null);
});
test("ensureFormConfigForOrg: returns saved config", async () => {
  route([[/SELECT fields FROM form_configs/i, [{ fields: [{ key: "student_name", label: "Name", enabled: true }] }]]]);
  const out = await ensureFormConfigForOrg({ schoolId: "s1" });
  assert.deepEqual(out.map((f) => f.key), ["student_name"]);
  assert.equal(await (await import("../../src/controllers/formConfigController.ts")).ensureFormConfigForOrg({}).then((r) => r.length), 0);
});
test("backfillFormConfigForOrg: no data => []", async () => {
  route([[/COUNT\(\*\)/i, [{ count: "0" }]], [/import_batches/i, [{ count: "0" }]]]);
  assert.deepEqual(await backfillFormConfigForOrg({ schoolId: "s1" }), []);
  assert.deepEqual(await backfillFormConfigForOrg({}), []);
});
test("loadFormConfigForOrg: returns saved fields (meta stripped, signature added)", async () => {
  route([[/SELECT fields FROM form_configs/i, [{ fields: [{ key: "student_name", label: "Name", enabled: true }] }]]]);
  const out = await loadFormConfigForOrg({ schoolId: "s1" });
  assert.ok(out.some((f) => f.key === "student_name"));
  assert.deepEqual(await loadFormConfigForOrg({}), []);
});

// ---- HTTP handlers ----
function reqres(body: unknown, query: unknown = {}) {
  const res: any = { status(c: number) { this.code = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  let nextErr: unknown = "none";
  return { req: { body, query, user: { userId: "a1", role: "admin" } } as any, res, next: (e?: unknown) => { nextErr = e; }, getErr: () => nextErr };
}
test("getFormConfig: validation errors", async () => {
  route(scopeRules);
  let c = reqres({}, {}); await getFormConfig(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /schoolId or instituteId/);
  c = reqres({}, { schoolId: "s1", instituteId: "i1" }); await getFormConfig(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /only one organization/);
});
test("getFormConfig: returns saved fields", async () => {
  route([...scopeRules,
    [/SELECT fields FROM form_configs/i, [{ fields: [{ key: "student_name", label: "Name", enabled: true }] }]],
    [/COUNT\(\*\)/i, [{ count: "3" }]],
    [/import_batches/i, [{ count: "0" }]],
    [/FROM import_batches .*ORDER BY|latest/i, []],
  ]);
  const c = reqres({}, { schoolId: "s1" });
  await getFormConfig(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.code, 200);
  assert.ok(c.res.body.fields.some((f: any) => f.key === "student_name"));
});
test("putFormConfig: validation + happy path", async () => {
  route(scopeRules);
  let c = reqres({ schoolId: "s1" }); await putFormConfig(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /fields array is required/);

  route([...scopeRules,
    [/SELECT fields FROM form_configs/i, [{ fields: [] }]],
    [/UPDATE form_configs/i, [{ id: "c1" }]],
    [/COUNT\(\*\)/i, [{ count: "0" }]],
  ]);
  c = reqres({ schoolId: "s1", fields: [{ key: "student_name", label: "Name", required: true, enabled: true }] });
  await putFormConfig(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.configured, true);
  assert.ok(c.res.body.fields.some((f: any) => f.key === "student_name"));
});
test("syncFormConfig: rebuild happy path", async () => {
  route([...scopeRules,
    [/DELETE FROM form_configs/i, []],
    [/COUNT\(\*\)/i, [{ count: "0" }]],
    [/import_batches/i, [{ count: "0" }]],
  ]);
  const c = reqres({ schoolId: "s1" });
  await syncFormConfig(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.code, 200);
});
test("syncFormConfigFromExcelFields / Headers", async () => {
  route([[/SELECT fields FROM form_configs/i, [{ fields: [] }]], [/UPDATE form_configs/i, [{ id: "c1" }]], [/COUNT|import_batches/i, [{ count: "0" }]]]);
  const out = await syncFormConfigFromExcelFields({ schoolId: "s1" }, [{ key: "fld_0", label: "Name", enabled: true }]);
  assert.ok(out.some((f) => f.key === "fld_0"));
  assert.deepEqual(await syncFormConfigFromExcelFields({}, []), []);
  const out2 = await syncFormConfigFromExcelHeaders({ schoolId: "s1" }, ["Name", "Class"]);
  assert.ok(out2.length >= 2);
});

// Richer router: excel_schema before import_batches; column-count FILTER before student count.
const COUNT_COLS = { total: "2", photo_id: "2", class_section: "2", student_name: "2", parent_name: "0", parent_phone: "0", address: "0", roll_no: "0", dob: "0", gender: "0", blood_group: "0", custom_1: "0", custom_2: "0", custom_3: "0" };

test("backfillFormConfigForOrg: uses excel schema from latest batch", async () => {
  route([
    [/COUNT\(\*\)::text AS count FROM students/i, [{ count: "2" }]],
    [/COUNT\(\*\)::text AS count FROM import_batches/i, [{ count: "1" }]],
    [/excel_schema, excel_headers/i, [{ excel_schema: [{ key: "fld_0", label: "Name", enabled: true, source: "excel", colIndex: 0 }], excel_headers: null }]],
    [/UPDATE form_configs/i, [{ id: "c1" }]],
  ]);
  const out = await backfillFormConfigForOrg({ schoolId: "s1" });
  assert.ok(out.some((f) => f.key === "fld_0"));
});
test("backfillFormConfigForOrg: infers from column counts when no excel schema", async () => {
  route([
    [/COUNT\(\*\)::text AS count FROM students/i, [{ count: "2" }]],
    [/COUNT\(\*\)::text AS count FROM import_batches/i, [{ count: "0" }]],
    [/excel_schema, excel_headers/i, [{ excel_schema: null, excel_headers: null }]],
    [/COUNT\(\*\) FILTER/i, [COUNT_COLS]],
    [/UPDATE form_configs/i, [{ id: "c1" }]],
  ]);
  const out = await backfillFormConfigForOrg({ schoolId: "s1" });
  assert.ok(out.length > 0);
});
test("loadFormConfigForOrg: rebuilds from data when no saved config", async () => {
  route([
    [/SELECT fields FROM form_configs/i, [{ fields: [] }]],
    [/DELETE FROM form_configs/i, []],
    [/COUNT\(\*\)::text AS count FROM students/i, [{ count: "2" }]],
    [/COUNT\(\*\)::text AS count FROM import_batches/i, [{ count: "0" }]],
    [/excel_schema, excel_headers/i, [{ excel_schema: [{ key: "fld_0", label: "Name", enabled: true, source: "excel", colIndex: 0 }], excel_headers: null }]],
    [/UPDATE form_configs/i, [{ id: "c1" }]],
  ]);
  const out = await loadFormConfigForOrg({ schoolId: "s1" });
  assert.ok(out.some((f) => f.key === "fld_0"));
});
test("getFormConfig: seeds defaults for a brand-new empty org", async () => {
  let configRows: unknown[] = [];
  route([
    ...scopeRules,
    [/SELECT fields FROM form_configs/i, () => [...configRows]],
    [/SELECT 1 FROM form_configs/i, () => configRows],
    [/COUNT\(\*\)::text AS count FROM students/i, [{ count: "0" }]],
    [/COUNT\(\*\)::text AS count FROM import_batches/i, [{ count: "0" }]],
    [/excel_schema, excel_headers/i, [{ excel_schema: null, excel_headers: null }]],
    [/INSERT INTO form_configs/i, () => { configRows = [{ fields: DEFAULT_SEED_FIELDS }]; return []; }],
    [/UPDATE form_configs/i, []],
  ]);
  const c = reqres({}, { schoolId: "s1" });
  await getFormConfig(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.ok(c.res.body.fields.some((f: any) => f.key === "student_name"));
});
test("putFormConfig: preserves excel fields + stores field meta (dropdown/options/group/required)", async () => {
  route([
    ...scopeRules,
    [/SELECT fields FROM form_configs/i, [{ fields: [{ key: "fld_9", label: "Imported", enabled: true, source: "excel", colIndex: 9 }] }]],
    [/UPDATE form_configs/i, [{ id: "c1" }]],
    [/COUNT|import_batches|excel_schema/i, [{ count: "1" }]],
  ]);
  const c = reqres({ schoolId: "s1", fields: [
    { key: "student_name", label: "Name", enabled: true, required: true },
    { key: "dyn_1", label: "House", fieldType: "dropdown", options: [" Red ", "Blue", ""], isGroup: true, enabled: true },
  ] });
  await putFormConfig(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  const keys = c.res.body.fields.map((f: any) => f.key);
  assert.ok(keys.includes("fld_9"));   // excel field preserved even though not re-sent
  const house = c.res.body.fields.find((f: any) => f.key === "dyn_1");
  assert.equal(house.fieldType, "dropdown");
  assert.deepEqual(house.options, ["Red", "Blue"]);
  assert.equal(house.isGroup, true);
});
