import crypto from "crypto";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBulkIds(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw)) throw new AppError("ids are required", 400);
  const ids = [
    ...new Set(
      raw.map((id) => String(id).trim()).filter((id) => id.length > 0)
    ),
  ];
  if (ids.length === 0) throw new AppError(`Select at least one ${label}`, 400);
  if (ids.length > MAX_BULK) {
    throw new AppError(`Select ${MAX_BULK} ${label}s or fewer at a time`, 400);
  }
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new AppError(`Invalid ${label} id`, 400);
  }
  return ids;
}

/** Most items one bulk action may touch. */
export const MAX_BULK = 1000;

/**
 * Short, stable key for "this exact set of ids" (used to bind the delete OTP).
 * The old key joined every id into one long string; above ~70 ids it was too long for
 * the database index, so requesting the OTP — and every bulk delete — failed.
 */
export function bulkResourceId(ids: string[]): string {
  const sorted = [...ids].sort();
  return `bulk:${sorted.length}:${crypto.createHash("sha256").update(sorted.join(",")).digest("hex")}`;
}

export async function requireAdminEmail(adminUserId: string): Promise<string> {
  const admin = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
    [adminUserId]
  );
  const email = admin.rows[0]?.email;
  if (!email) {
    throw new AppError("Admin account email is required to send OTP", 400);
  }
  return email;
}
