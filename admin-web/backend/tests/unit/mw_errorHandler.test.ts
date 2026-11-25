import { test, mock } from "node:test";
import assert from "node:assert/strict";
import multer from "multer";
import { AppError, errorHandler } from "../../src/middleware/errorHandler.ts";

function res() {
  const out: any = {};
  return { status(c: number) { out.code = c; return this; }, json(b: unknown) { out.body = b; return this; }, out } as any;
}
const run = (err: unknown) => { const r = res(); errorHandler(err as any, {} as any, r, (() => {}) as any); return r.out; };

test("duplicate_record_details => 409", () => {
  const e = Object.assign(new Error("x"), { constraint: "duplicate_record_details" });
  assert.equal(run(e).code, 409);
  assert.match(run(e).body.message, /already exists/);
});
test("MulterError LIMIT_FILE_SIZE => 400 friendly", () => {
  const out = run(new multer.MulterError("LIMIT_FILE_SIZE"));
  assert.equal(out.code, 400);
  assert.match(out.body.message, /too large/);
});
test("MulterError other => 400 with its message", () => {
  assert.equal(run(new multer.MulterError("LIMIT_UNEXPECTED_FILE")).code, 400);
});
test("AppError => its status/message", () => {
  const out = run(new AppError("nope", 403));
  assert.equal(out.code, 403);
  assert.equal(out.body.message, "nope");
});
test("generic 500 is masked + logged", () => {
  mock.method(console, "error", () => {});
  const out = run(new Error("secret internal"));
  assert.equal(out.code, 500);
  assert.match(out.body.message, /Something went wrong/);
  mock.restoreAll();
});
