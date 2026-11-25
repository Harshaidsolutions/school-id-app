import { test, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { route, reqres } from "../helpers/testkit.ts";

beforeEach(() => { mock.module("../../src/config/storage.ts", { namedExports: { uploadCatalogFile: async () => "https://cdn/file" } }); });
afterEach(() => mock.restoreAll());
const load = () => import("../../src/controllers/catalogController.ts");
const admin = { userId: "a1", role: "admin" };
const superScope: any = [[/FROM users WHERE id/i, [{ is_super_admin: true }]]];
const owned: any = [/SELECT owner_admin_id FROM catalog_items/i, [{ owner_admin_id: "a1" }]];
const img = { originalname: "pic.png", size: 100, mimetype: "image/png" };
const vid = { originalname: "clip.mp4", size: 200, mimetype: "video/mp4" };
const item = (o: Record<string, unknown> = {}) => ({ id: "c1", kind: "model", name: "M", description: null, image_url: null, video_url: null, extra_image_urls: null, file_size: 0, created_at: "t", ...o });

test("listCatalogItems: invalid kind + success", async () => {
  const { listCatalogItems } = await load();
  route(superScope);
  let c = reqres({ user: admin, query: { kind: "bogus" } });
  await listCatalogItems(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Invalid catalog kind/);
  route([...superScope, [/FROM catalog_items/i, [item(), item({ id: "c2" })]]]);
  c = reqres({ user: admin, query: { kind: "models" } }); // alias -> model
  await listCatalogItems(c.req, c.res, c.next); assert.equal(c.res.body.count, 2);
});
test("createCatalogItem: image required / video-non-model / success", async () => {
  const { createCatalogItem } = await load();
  route(superScope);
  let c = reqres({ user: admin, body: { kind: "tag" } });
  await createCatalogItem(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /Image file is required/);
  c = reqres({ user: admin, body: { kind: "tag" } }); c.req.file = vid;
  await createCatalogItem(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /only allowed for models/);
  route([...superScope, [/INSERT INTO catalog_items/i, [item({ kind: "tag" })]], [/UPDATE catalog_items/i, [item({ kind: "tag", image_url: "https://cdn/file" })]]]);
  c = reqres({ user: admin, body: { kind: "tag" } }); c.req.file = img;
  await createCatalogItem(c.req, c.res, c.next); assert.equal(c.res.code, 201);
});
test("updateCatalogItem: id / not found / success", async () => {
  const { updateCatalogItem } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: {} });
  await updateCatalogItem(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /id is required/);
  route([...superScope, owned, [/SELECT id, kind, name[\s\S]*FROM catalog_items WHERE id/i, []]]);
  c = reqres({ user: admin, params: { id: "c1" } });
  await updateCatalogItem(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([...superScope, owned, [/SELECT id, kind, name[\s\S]*FROM catalog_items WHERE id/i, [item()]], [/UPDATE catalog_items/i, [item({ name: "New" })]]]);
  c = reqres({ user: admin, params: { id: "c1" }, body: { name: "New" } });
  await updateCatalogItem(c.req, c.res, c.next); assert.equal(c.res.body.item.name, "New");
});
test("appendCatalogExtraImage + removeCatalogExtraImage", async () => {
  const { appendCatalogExtraImage, removeCatalogExtraImage } = await load();
  route(superScope);
  let c = reqres({ user: admin, params: { id: "c1" } });
  await appendCatalogExtraImage(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /at least one image/);
  route([...superScope, owned, [/SELECT id, kind, extra_image_urls FROM catalog_items/i, [item({ extra_image_urls: [] })]], [/UPDATE catalog_items/i, [item({ extra_image_urls: ["https://cdn/file"] })]]]);
  c = reqres({ user: admin, params: { id: "c1" } }); c.req.files = [img] as any;
  await appendCatalogExtraImage(c.req, c.res, c.next); assert.equal(c.res.body.item.extra_image_urls.length, 1);
  route([...superScope, owned, [/SELECT id, extra_image_urls FROM catalog_items/i, [item({ extra_image_urls: ["u1", "u2"] })]], [/UPDATE catalog_items/i, [item({ extra_image_urls: ["u2"] })]]]);
  c = reqres({ user: admin, params: { id: "c1" }, body: { url: "u1" } });
  await removeCatalogExtraImage(c.req, c.res, c.next); assert.deepEqual(c.res.body.item.extra_image_urls, ["u2"]);
});
test("deleteCatalogItem + bulkDeleteCatalogItems", async () => {
  const { deleteCatalogItem, bulkDeleteCatalogItems } = await load();
  route([...superScope, owned, [/DELETE FROM catalog_items/i, []]]);
  let c = reqres({ user: admin, params: { id: "c1" } });
  await deleteCatalogItem(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /not found/);
  route([...superScope, [/ids are required/i, []]]);
  c = reqres({ user: admin, body: { ids: "x" } });
  await bulkDeleteCatalogItems(c.req, c.res, c.next); assert.match(String((c.getErr() as Error).message), /ids are required/);
  let n = 0;
  route([...superScope, owned, [/DELETE FROM catalog_items/i, () => (n++ === 0 ? [{ id: "c1" }] : [])]]);
  c = reqres({ user: admin, body: { ids: ["c1", "c2"] } });
  await bulkDeleteCatalogItems(c.req, c.res, c.next); assert.equal(c.res.body.status, "partial");
});
test("listTeacherBrochures + getLatestTeacherBrochure", async () => {
  const { listTeacherBrochures, getLatestTeacherBrochure } = await load();
  const teacher = { userId: "u1", role: "teacher", schoolId: "s1" };
  route([[/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: null }]]]);
  let c = reqres({ user: teacher });
  await listTeacherBrochures(c.req, c.res, c.next); assert.equal(c.res.body.count, 0);
  route([[/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/kind = 'brochure'/i, [{ id: "b1", name: "Bro", image_url: "u", created_at: "t" }]]]);
  c = reqres({ user: teacher });
  await listTeacherBrochures(c.req, c.res, c.next); assert.equal(c.res.body.brochures[0].fileUrl, "u");
  route([[/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/kind = 'brochure'/i, [{ id: "b1", name: "Bro", image_url: "u", created_at: "t" }]]]);
  c = reqres({ user: teacher });
  await getLatestTeacherBrochure(c.req, c.res, c.next); assert.equal(c.res.body.brochure.id, "b1");
  route([[/SELECT owner_admin_id FROM schools/i, [{ owner_admin_id: "a1" }]], [/kind = 'brochure'/i, []]]);
  c = reqres({ user: teacher });
  await getLatestTeacherBrochure(c.req, c.res, c.next); assert.equal(c.res.body.brochure, null);
});
