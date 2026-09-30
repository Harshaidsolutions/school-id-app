import type { Request } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";

/** Primary super admin account (matches migrate backfill). */
export const SUPER_ADMIN_EMAIL = "harshaidsolutions@gmail.com";

const SUPER_ADMIN_USERNAMES = new Set([
  "harsha",
  "harshaidsolutions",
  "harshaid",
  "harshaidsolutions@gmail.com",
]);

export type AdminScope = {
  adminUserId: string;
  isSuperAdmin: boolean;
};

function isDbTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "t" || value === "true";
}

export function isPrimarySuperAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

/** Harsha ID Solutions primary super admin — sole account allowed to use forgot-password. */
export function userMayUseAdminPasswordReset(user: {
  role?: string | null;
  email?: string | null;
  username?: string | null;
  is_super_admin?: boolean | null;
}): boolean {
  if (user.role !== "admin") return false;
  if (!isPrimarySuperAdminEmail(String(user.email ?? ""))) return false;
  return resolveIsSuperAdmin(user);
}

export function resolveIsSuperAdmin(user: {
  role?: string | null;
  email?: string | null;
  username?: string | null;
  is_super_admin?: boolean | null;
}): boolean {
  if (user.role !== "admin") return false;
  if (isDbTrue(user.is_super_admin)) return true;
  const email = String(user.email ?? "")
    .trim()
    .toLowerCase();
  if (email === SUPER_ADMIN_EMAIL) return true;
  if (email.includes("harshaidsolutions")) return true;
  const username = String(user.username ?? "")
    .trim()
    .toLowerCase();
  if (SUPER_ADMIN_USERNAMES.has(username)) return true;
  if (username.includes("harshaid")) return true;
  return false;
}

/** Authoritative: can this admin list every school/institute (not only owned)? */
export async function queryAdminSeesAllOrganizations(
  adminUserId: string
): Promise<boolean> {
  const result = await pool.query<{ see_all: boolean }>(
    `SELECT (
       COALESCE(u.is_super_admin, false)
       OR lower(trim(u.email)) = $2
       OR lower(trim(u.email)) LIKE '%harshaidsolutions%'
       OR lower(trim(COALESCE(u.username, ''))) = ANY($3::text[])
       OR lower(trim(COALESCE(u.username, ''))) LIKE '%harshaid%'
       OR (SELECT COUNT(*)::int FROM users WHERE role = 'admin') <= 1
       OR u.id = (
         SELECT id FROM users
         WHERE role = 'admin'
         ORDER BY created_at ASC NULLS LAST
         LIMIT 1
       )
     ) AS see_all
     FROM users u
     WHERE u.id = $1::uuid AND u.role = 'admin'
     LIMIT 1`,
    [adminUserId, SUPER_ADMIN_EMAIL, [...SUPER_ADMIN_USERNAMES]]
  );
  return isDbTrue(result.rows[0]?.see_all);
}

export async function loadAdminScope(userId: string): Promise<AdminScope> {
  const row = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1::uuid AND role = 'admin' LIMIT 1`,
    [userId]
  );
  if (!row.rows[0]) {
    throw new AppError("Admin account not found", 403);
  }
  const isSuperAdmin = await queryAdminSeesAllOrganizations(userId);
  return {
    adminUserId: userId,
    isSuperAdmin,
  };
}

/** Super admin sees every school/institute; scoped admins see only owned orgs. */
export async function adminSeesAllOrganizations(
  scope: AdminScope,
  req: Request
): Promise<boolean> {
  if (req.user?.isSuperAdmin === true) return true;
  if (scope.isSuperAdmin) return true;
  return queryAdminSeesAllOrganizations(scope.adminUserId);
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

/** Child admins may only touch a student in a school or institute they own. */
export async function assertStudentOwnedByAdmin(
  scope: AdminScope,
  student: { school_id?: string | null; institute_id?: string | null }
): Promise<void> {
  if (student.school_id) {
    await assertSchoolOwnedByAdmin(scope, student.school_id);
    return;
  }
  if (student.institute_id) {
    await assertInstituteOwnedByAdmin(scope, student.institute_id);
    return;
  }
  throw new AppError("Student not found", 404);
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

/** Templates, models, tags, brochures — each admin owns their own catalog (no sharing). */
export function adminCatalogOwnerSql(
  scope: AdminScope,
  tableAlias: string,
  paramIndex: number
): { clause: string; value: string } {
  return {
    clause: ` AND ${tableAlias}.owner_admin_id = $${paramIndex}`,
    value: scope.adminUserId,
  };
}

export async function assertCatalogRowOwnedByAdmin(
  scope: AdminScope,
  table: "templates" | "catalog_items",
  rowId: string
): Promise<void> {
  const row = await pool.query<{ owner_admin_id: string | null }>(
    `SELECT owner_admin_id FROM ${table} WHERE id = $1 LIMIT 1`,
    [rowId]
  );
  if (!row.rows[0]) {
    throw new AppError("Item not found", 404);
  }
  if (row.rows[0].owner_admin_id !== scope.adminUserId) {
    throw new AppError("Item not found", 404);
  }
}

export async function loadOrgOwnerAdminId(
  orgTable: "schools" | "institutes",
  orgId: string
): Promise<string | null> {
  const row = await pool.query<{ owner_admin_id: string | null }>(
    `SELECT owner_admin_id FROM ${orgTable} WHERE id = $1 LIMIT 1`,
    [orgId]
  );
  return row.rows[0]?.owner_admin_id ?? null;
}

/** Notifications tied to schools/institutes the admin may access. */
export async function assertNotificationOwnedByAdmin(
  scope: AdminScope,
  seeAll: boolean,
  notificationId: string
): Promise<void> {
  if (seeAll) return;
  const row = await pool.query<{ id: string }>(
    `SELECT n.id
     FROM notifications n
     LEFT JOIN schools s ON s.id = n.school_id
     LEFT JOIN institutes i ON i.id = n.institute_id
     WHERE n.id = $1
       AND COALESCE(n.audience, 'org') <> 'super_admin'
       AND (
         s.owner_admin_id = $2
         OR i.owner_admin_id = $2
       )
     LIMIT 1`,
    [notificationId, scope.adminUserId]
  );
  if (!row.rows[0]) {
    throw new AppError("Notification not found", 404);
  }
}
