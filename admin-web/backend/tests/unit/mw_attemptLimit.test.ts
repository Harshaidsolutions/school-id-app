import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeAttempt, limitAuthAttempts } from "../../src/middleware/attemptLimit.ts";

test("consumeAttempt: allows up to max, then 429", () => {
  const key = `k-${Math.random()}`;
  assert.doesNotThrow(() => consumeAttempt(key, 2));
  assert.doesNotThrow(() => consumeAttempt(key, 2));
  assert.throws(() => consumeAttempt(key, 2), /Too many attempts/);
});
test("consumeAttempt: expired bucket resets", () => {
  const key = `k-${Math.random()}`;
  consumeAttempt(key, 1, -1); // window already expired on next call
  assert.doesNotThrow(() => consumeAttempt(key, 1, 1000)); // evicted, fresh bucket
});
test("limitAuthAttempts: passes then blocks with Retry-After", () => {
  const headers: Record<string, string> = {};
  const res: any = { setHeader: (k: string, v: string) => { headers[k] = v; } };
  const req: any = { path: "/verify", ip: "1.2.3.4", body: { email: "a@b.com" } };
  let lastErr: unknown = "none";
  const next = (e?: unknown) => { lastErr = e; };
  for (let i = 0; i < 10; i++) limitAuthAttempts(req, res, next);
  assert.equal(lastErr, undefined); // 10 allowed for non-login
  limitAuthAttempts(req, res, next); // 11th blocked
  assert.match(String((lastErr as Error).message), /Too many attempts/);
  assert.equal(headers["Retry-After"], "900");
});
