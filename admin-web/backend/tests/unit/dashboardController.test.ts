import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/dashboardController.ts");

const common = [
  [/FROM schools WHERE/i, [{ total: "3", active: "2", inactive: "1" }]],
  [/FROM institutes WHERE/i, [{ total: "1", active: "1", inactive: "0" }]],
  [/FROM organizations WHERE/i, [{ total: "0", active: "0", inactive: "0" }]],
  [/WITH records AS/i, [{ total: "0", captured: "0", uncaptured: "0" }]],
  [/INNER JOIN schools sc/i, [{ total: "10", captured: "7", uncaptured: "3" }]],
  [/INNER JOIN institutes i/i, [{ total: "5", captured: "2", uncaptured: "3" }]],
  [/FROM templates WHERE/i, [{ count: "4" }]],
  [/kind = 'model'/i, [{ count: "6" }]],
  [/generate_series/i, [{ day: "2026-01-01", schools: "1", institutes: "0" }]],
  [/ORDER BY created_at DESC/i, [{ kind: "school", title: "S1", created_at: "t" }]],
] as any;

test("getDashboardSummary: super admin sees all, aggregates counts", async () => {
  route([[/FROM users WHERE id/i, [{ is_super_admin: true }]], ...common]);
  const c = reqres({ user: { userId: "a1", role: "admin" }, query: { year: "2026" } });
  const { getDashboardSummary } = await load();
  await getDashboardSummary(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.totalSchools, 3);
  assert.equal(c.res.body.activeSchools, 2);
  assert.equal(c.res.body.schoolPhotos, 10);
  assert.equal(c.res.body.schoolCaptured, 7);
  assert.equal(c.res.body.institutePhotos, 5);
  assert.equal(c.res.body.totalTemplates, 4);
  assert.equal(c.res.body.totalModels, 6);
  assert.equal(c.res.body.year, "2026");
  assert.equal(c.res.body.overview.length, 1);
  assert.equal(c.res.body.recentActivity.length, 1);
});
test("getDashboardSummary: scoped admin (not super) still responds", async () => {
  route([[/see_all/i, [{ see_all: false }]], [/FROM users WHERE id/i, [{ is_super_admin: false }]], ...common]);
  const c = reqres({ user: { userId: "a1", role: "admin" }, query: {} });
  const { getDashboardSummary } = await load();
  await getDashboardSummary(c.req, c.res, c.next);
  assert.equal(c.getErr(), "none");
  assert.equal(c.res.body.year, null);
  assert.equal(c.res.body.totalInstitutes, 1);
});
