import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { catalogImageByName, resolveTagSelections, resolveModelImageUrl, resolveTemplateImageUrl } from "../../src/utils/orgSelectionImages.ts";
import { pool } from "../../src/config/database.ts";

afterEach(() => mock.restoreAll());

test("catalogImageByName: blank name => null", async () => {
  assert.equal(await catalogImageByName("tag", "  "), null);
});
test("catalogImageByName: exact match wins", async () => {
  mock.method(pool, "query", async () => ({ rows: [{ image_url: "u-exact" }] }) as any);
  assert.equal(await catalogImageByName("model", "A", "owner1"), "u-exact");
});
test("catalogImageByName: falls back to case-insensitive, then null", async () => {
  let call = 0;
  mock.method(pool, "query", async () => (call++ === 0 ? { rows: [{ image_url: null }] } : { rows: [{ image_url: "u-ci" }] }) as any);
  assert.equal(await catalogImageByName("tag", "b"), "u-ci");
  call = 0;
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  assert.equal(await catalogImageByName("tag", "b"), null);
});
test("resolveTagSelections: splits, dedupes, resolves", async () => {
  mock.method(pool, "query", async () => ({ rows: [{ image_url: "img" }] }) as any);
  const out = await resolveTagSelections("Red, Blue, Red");
  assert.deepEqual(out.map((o) => o.name), ["Red", "Blue"]);
  assert.equal(out[0].image_url, "img");
  assert.deepEqual(await resolveTagSelections("  "), []);
});
test("resolveModelImageUrl", async () => {
  assert.equal(await resolveModelImageUrl(""), null);
  mock.method(pool, "query", async () => ({ rows: [{ image_url: "m" }] }) as any);
  assert.equal(await resolveModelImageUrl("Model X"), "m");
});
test("resolveTemplateImageUrl", async () => {
  assert.equal(await resolveTemplateImageUrl("  "), null);
  mock.method(pool, "query", async () => ({ rows: [{ image_url: "t" }] }) as any);
  assert.equal(await resolveTemplateImageUrl("tpl1"), "t");
  mock.method(pool, "query", async () => ({ rows: [] }) as any);
  assert.equal(await resolveTemplateImageUrl("tpl2"), null);
});
