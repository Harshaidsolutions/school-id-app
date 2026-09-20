import type { Request } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";

/** Primary super admin account (matches migrate backfill). */
export const SUPER_ADMIN_EMAIL = "harshaidsolutions@gmail.com";

export type AdminScope = {
  adminUserId: string;
  isSuperAdmin: boolean;
};

export function resolveIsSuperAdmin(user: {
  role?: string | null;
  email?: string | null;
  is_super_admin?: boolean | null;
}): boolean {
  if (user.role !== "admin") return false;
  if (user.is_super_admin === true) return true;
  const email = String(user.email ?? "")
    .trim()
    .toLowerCase();
  return email === SUPER_ADMIN_EMAIL;
}

export async function loadAdminScope(userId: string): Promise<AdminScope> {
  const row = await pool.query<{
    email: string;
    is_super_admin: boolean | null;
  }>(
    `SELECT email, COALESCE(is_super_admin, false) AS is_super_admin
     FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
    [userId]
  );
  if (!row.rows[0]) {
    throw new AppError("Admin account not found", 403);
  }
  return {
    adminUserId: userId,
    isSuperAdmin: resolveIsSuperAdmin({
      role: "admin",
      email: row.rows[0].email,
      is_super_admin: row.rows[0].is_super_admin,
    }),
  };
}

export async function requireAdminScope(req: Request): Promise<AdminScope> {
  if (!req.user?.userId || req.user.role !== "admin") {
    throw new AppError("Admin access required", 403);
  }
  return loadAdminScope(req.user.userId);
}

export async function requireSuperAdmin(req: Request): Promise<AdminScope> {
  const scope = await requireAdminScope(req);
  if (!scope.isSuperAdmin) {
    throw new AppError("Super admin access required", 403);
  }
  return scope;
}

/** SQL fragment: AND schools.owner_admin_id = $n (omit for super admin). */
export function schoolOwnerSql(
  scope: AdminScope,
  paramIndex: number
): { clause: string; value: string | null } {
  if (scope.isSuperAdmin) {
    return { clause: "", value: null };
  }
  return {
    clause: ` AND s.owner_admin_id = $${paramIndex}`,
    value: scope.adminUserId,
  };
}

export async function assertSchoolOwnedByAdmin(
  scope: AdminScope,
  schoolId: string
): Promise<void> {
  if (scope.isSuperAdmin) return;
  const row = await pool.query(
    `SELECT id FROM schools WHERE id = $1 AND owner_admin_id = $2 LIMIT 1`,
    [schoolId, scope.adminUserId]
  );
  if (!row.rows[0]) {
    throw new AppError("School not found", 404);
  }
}

export async function assertInstituteOwnedByAdmin(
  scope: AdminScope,
  instituteId: string
): Promise<void> {
  if (scope.isSuperAdmin) return;
  const row = await pool.query(
    `SELECT id FROM institutes WHERE id = $1 AND owner_admin_id = $2 LIMIT 1`,
    [instituteId, scope.adminUserId]
  );
  if (!row.rows[0]) {
    throw new AppError("Institute not found", 404);
  }
}
