import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "./errorHandler";

const buckets = new Map<string, { count: number; expires: number }>();
const WINDOW_MS = 15 * 60 * 1000;

/** Per-process protection; front multiple API replicas with a shared gateway limiter. */
export function consumeAttempt(key: string, max: number, windowMs = WINDOW_MS): void {
  const now = Date.now();
  for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
  const id = createHash("sha256").update(key).digest("hex");
  let bucket = buckets.get(id);
  if (!bucket) {
    if (buckets.size >= 10000) throw new AppError("Too many attempts. Please try again later.", 429);
    bucket = { count: 0, expires: now + windowMs };
    buckets.set(id, bucket);
  }
  if (bucket.count >= max) throw new AppError("Too many attempts. Please try again later.", 429);
  bucket.count += 1;
}

export const limitAuthAttempts: RequestHandler = (req, res, next) => {
  try {
    const identity = String(req.body?.email ?? req.body?.username ?? req.body?.token ?? "").trim().toLowerCase();
    consumeAttempt(`auth:${req.path}:${req.ip}:${identity}`, req.path === "/login" ? 20 : 10);
    next();
  } catch (error) {
    res.setHeader("Retry-After", "900");
    next(error);
  }
};
