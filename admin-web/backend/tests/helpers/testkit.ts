import { mock } from "node:test";
import { pool } from "../../src/config/database.ts";

export type Rule = [RegExp, unknown[] | ((sql: string, p: unknown[]) => unknown[])];

/** Route pool.query by SQL fragment. First matching rule wins; else `fallback`. */
export function route(rules: Rule[], fallback: unknown[] = []) {
  return mock.method(pool, "query", async (sql: string, params: unknown[] = []) => {
    for (const [re, rows] of rules) {
      if (re.test(sql)) {
        const r = typeof rows === "function" ? rows(sql, params) : rows;
        return { rows: r, rowCount: r.length } as any;
      }
    }
    return { rows: fallback, rowCount: fallback.length } as any;
  });
}

/** Minimal Express req/res/next harness. `getErr()` returns "none" when next was never called. */
export function reqres(opts: { body?: unknown; query?: unknown; params?: unknown; user?: unknown; headers?: unknown } = {}) {
  const res: any = {
    code: undefined, body: undefined, headers: {} as Record<string, string>,
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; return this; },
  };
  let nextErr: unknown = "none";
  const req: any = { body: opts.body ?? {}, query: opts.query ?? {}, params: opts.params ?? {}, user: opts.user, headers: opts.headers ?? {} };
  return { req, res, next: (e?: unknown) => { nextErr = e; }, getErr: () => nextErr };
}

/** Make a fake pool client (for pool.connect()) that routes like `route`. */
export function fakeClient(rules: Rule[], fallback: unknown[] = []) {
  const query = mock.fn(async (sql: string, params: unknown[] = []) => {
    for (const [re, rows] of rules) if (re.test(sql)) { const r = typeof rows === "function" ? rows(sql, params) : rows; return { rows: r, rowCount: r.length } as any; }
    return { rows: fallback, rowCount: fallback.length } as any;
  });
  return { query, release: () => {}, connect: () => {} } as any;
}
