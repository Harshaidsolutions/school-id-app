import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/organizationController.ts");
const teacher = { userId: "u1", role: "teacher", schoolId: "s1" };
const instituteStaff = { userId: "u2", role: "institute_staff", instituteId: "i1" };

test("getTeacherOrganization: auth required", async () => {
  const { getTeacherOrganization } = await load();
  const c = reqres({ user: undefined });
  await getTeacherOrganization(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Authentication/);
});
test("getTeacherOrganization: school found + templates", async () => {
  route([
    [/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]],
    [/detail_year AS year[\s\S]*FROM schools/i, [{ id: "s1", name: "Zed", template_id: null }]],
    [/FROM templates\s+WHERE owner_admin_id/i, [{ id: "t1", name: "Classic", orientation: "portrait" }]],
  ]);
  const c = reqres({ user: teacher });
  const { getTeacherOrganization } = await load();
  await getTeacherOrganization(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.orgType, "school");
  assert.equal(c.res.body.school.name, "Zed");
  assert.equal(c.res.body.templates.length, 1);
});
test("getTeacherOrganization: institute found", async () => {
  route([[/FROM institutes\s+WHERE id/i, [{ id: "i1", name: "Inst" }]], [/owner_admin_id FROM institutes/i, [{ owner_admin_id: null }]]]);
  const c = reqres({ user: instituteStaff });
  const { getTeacherOrganization } = await load();
  await getTeacherOrganization(c.req, c.res, c.next);
  assert.equal(c.res.body.orgType, "institute");
  assert.equal(c.res.body.templates.length, 0);
});
test("getTeacherOrganization: not found", async () => {
  route([[/detail_year AS year[\s\S]*FROM schools/i, []]]);
  const c = reqres({ user: teacher });
  const { getTeacherOrganization } = await load();
  await getTeacherOrganization(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /School not found/);
});
test("updateTeacherOrganization: school phone-only update (no selection change)", async () => {
  route([
    [/FROM schools WHERE id = \$1 LIMIT 1/i, [{ id: "s1", name: "Zed", template_id: null, model: null, tags: null }]],
    [/UPDATE schools/i, [{ id: "s1", name: "Zed", phone: "999" }]],
  ]);
  const c = reqres({ user: teacher, body: { phone: "999" } });
  const { updateTeacherOrganization } = await load();
  await updateTeacherOrganization(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.orgType, "school");
});
test("updateTeacherOrganization: template not found rejects", async () => {
  route([
    [/FROM schools WHERE id = \$1 LIMIT 1/i, [{ id: "s1", template_id: "old", model: null, tags: null }]],
    [/FROM schools o/i, [{ template_locked: false, model_locked: false, final_by: null, final_name: null, final_at: null }]],
    [/owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]],
    [/FROM templates WHERE id = \$1 AND owner_admin_id/i, []],
  ]);
  const c = reqres({ user: teacher, body: { template_id: "new-tpl" } });
  const { updateTeacherOrganization } = await load();
  await updateTeacherOrganization(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Template not found/);
});
test("updateTeacherOrganization: institute update", async () => {
  route([
    [/FROM institutes WHERE id = \$1 LIMIT 1/i, [{ id: "i1", name: "Inst", template_id: null, model: null, tags: null }]],
    [/UPDATE institutes/i, [{ id: "i1", name: "Inst" }]],
  ]);
  const c = reqres({ user: instituteStaff, body: { address: "New Rd" } });
  const { updateTeacherOrganization } = await load();
  await updateTeacherOrganization(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.orgType, "institute");
});
test("updateTeacherOrganization: auth required", async () => {
  const { updateTeacherOrganization } = await load();
  const c = reqres({ user: undefined });
  await updateTeacherOrganization(c.req, c.res, c.next);
  assert.match(String((c.getErr() as Error).message), /Authentication/);
});
