import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/templateController.ts");
const admin = { userId: "a1", role: "admin" };
const superScope: any = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]];
const owned: any = [/SELECT owner_admin_id FROM templates/i, [{ owner_admin_id: "a1" }]];
const ORI = "vertical_single";
const tpl = (o: Record<string, unknown> = {}) => ({ id: "t1", name: "Classic", orientation: ORI, config_json: null, owner_admin_id: "a1", purpose: "school", ...o });

test("createTemplate: validation + success + generator purpose", async () => {
  const { createTemplate } = await load();
  route(superScope);
  let c = reqres({ user: admin, body: {} });
  await createTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /name is required/);
  c = reqres({ user: admin, body: { name: "T", orientation: "weird" } });
  await createTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /orientation must be/);
  route([...superScope, [/INSERT INTO templates/i, [tpl()]]]);
  c = reqres({ user: admin, body: { name: "T", orientation: ORI, purpose: "generator", config_json: '{"a":1}' } });
  await createTemplate(c.req, c.res, c.next); assert.equal(c.res.code, 201); assert.equal(c.res.body.template.id, "t1");
});
test("createTemplate: invalid config json", async () => {
  const { createTemplate } = await load();
  route(superScope);
  const c = reqres({ user: admin, body: { name: "T", orientation: ORI, config_json: "{bad" } });
  await createTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /valid JSON/);
});
test("listTemplates + listTemplatesBySchool + orientation filter", async () => {
  const { listTemplates, listTemplatesBySchool } = await load();
  route([...superScope, [/SELECT \* FROM templates/i, [tpl(), tpl({ id: "t2" })]]]);
  let c = reqres({ user: admin, query: { purpose: "all" } });
  await listTemplates(c.req, c.res, c.next); assert.equal(c.res.body.count, 2);
  c = reqres({ user: admin, query: { orientation: "nope" } });
  await listTemplates(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Invalid orientation/);
  route([...superScope, [/SELECT \* FROM templates/i, [tpl()]]]);
  c = reqres({ user: admin, query: {} });
  await listTemplatesBySchool(c.req, c.res, c.next); assert.equal(c.res.body.count, 1);
});
test("updateTemplate: id required / not found / name / success", async () => {
  const { updateTemplate } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: {} });
  await updateTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([...superScope, owned, [/SELECT \* FROM templates WHERE id/i, []]]);
  c = reqres({ user: admin, params: { id: "t1" } });
  await updateTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([...superScope, owned, [/SELECT \* FROM templates WHERE id/i, [tpl()]], [/UPDATE templates/i, [tpl({ name: "New" })]]]);
  c = reqres({ user: admin, params: { id: "t1" }, body: { name: "New", orientation: ORI } });
  await updateTemplate(c.req, c.res, c.next); assert.equal(c.res.body.template.name, "New");
});
test("deleteTemplate: success + not found", async () => {
  const { deleteTemplate } = await load();
  route([...superScope, owned, [/UPDATE schools|UPDATE institutes/i, []], [/DELETE FROM templates/i, [{ id: "t1" }]]]);
  let c = reqres({ user: admin, params: { id: "t1" } });
  await deleteTemplate(c.req, c.res, c.next); assert.equal(c.res.body.deleted, true);
  route([...superScope, owned, [/UPDATE schools|UPDATE institutes/i, []], [/DELETE FROM templates/i, []]]);
  c = reqres({ user: admin, params: { id: "t1" } });
  await deleteTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
});
test("bulkDeleteTemplates: validation + partial", async () => {
  const { bulkDeleteTemplates } = await load();
  route(superScope);
  let c = reqres({ user: admin, body: { ids: "x" } });
  await bulkDeleteTemplates(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /ids are required/);
  c = reqres({ user: admin, body: { ids: [] } });
  await bulkDeleteTemplates(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least one/);
  // one deletes, one not found
  let n = 0;
  route([...superScope, owned, [/UPDATE schools|UPDATE institutes/i, []], [/DELETE FROM templates/i, () => (n++ === 0 ? [{ id: "t1" }] : [])]]);
  c = reqres({ user: admin, body: { ids: ["t1", "t2"] } });
  await bulkDeleteTemplates(c.req, c.res, c.next);
  assert.equal(c.res.body.status, "partial");
  assert.deepEqual(c.res.body.deleted, ["t1"]);
  assert.equal(c.res.body.failedCount, 1);
});
test("listTeacherTemplates: auth / no owner / success", async () => {
  const { listTeacherTemplates } = await load();
  let c = reqres({ user: undefined });
  await listTeacherTemplates(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/);
  route([[/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: null }]]]);
  c = reqres({ user: { userId: "u1", role: "teacher", schoolId: "s1" } });
  await listTeacherTemplates(c.req, c.res, c.next); assert.equal(c.res.body.count, 0);
  route([[/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/SELECT \* FROM templates/i, [tpl()]], [/SELECT template_id FROM schools/i, [{ template_id: "t1" }]]]);
  c = reqres({ user: { userId: "u1", role: "teacher", schoolId: "s1" } });
  await listTeacherTemplates(c.req, c.res, c.next); assert.equal(c.res.body.selectedTemplateId, "t1");
});
test("selectTeacherTemplate: auth / id / not found / success", async () => {
  const { selectTeacherTemplate } = await load();
  let c = reqres({ user: undefined, params: { id: "t1" } });
  await selectTeacherTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Authentication/);
  const sel: any = [/FROM schools o/i, [{ template_locked: false, model_locked: false, final_by: null, final_name: null, final_at: null }]];
  route([sel, [/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/SELECT \* FROM templates WHERE id = \$1 AND owner_admin_id/i, []]]);
  c = reqres({ user: { userId: "u1", role: "teacher", schoolId: "s1" }, params: { id: "t9" } });
  await selectTeacherTemplate(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([sel, [/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/SELECT \* FROM templates WHERE id = \$1 AND owner_admin_id/i, [tpl()]], [/UPDATE schools SET template_id/i, []]]);
  c = reqres({ user: { userId: "u1", role: "teacher", schoolId: "s1" }, params: { id: "t1" } });
  await selectTeacherTemplate(c.req, c.res, c.next); assert.equal(c.res.body.selectedTemplateId, "t1");
});
