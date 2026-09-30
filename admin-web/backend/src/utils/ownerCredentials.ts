/**
 * SQL helpers for resolving school/institute owner credentials in list queries.
 * Prefer plain-text columns on the org row, then fall back to linked owner user.
 */

export const ownerUserLateralJoin = (
  orgAlias: "s" | "i",
  linkColumn: "school_id" | "institute_id"
): string => `
  LEFT JOIN LATERAL (
    SELECT u.id, u.username, u.email, u.password_plain
    FROM users u
    WHERE u.${linkColumn} = ${orgAlias}.id
    ORDER BY COALESCE(u.is_owner, false) DESC,
             (NULLIF(TRIM(u.password_plain), '') IS NOT NULL) DESC,
             (NULLIF(TRIM(u.username), '') IS NOT NULL) DESC,
             u.created_at ASC NULLS LAST
    LIMIT 1
  ) owner ON true`;

export const ownerUsernameSelect = (plainColumn: string): string => `
  COALESCE(
    NULLIF(TRIM(${plainColumn}), ''),
    NULLIF(TRIM(owner.username), ''),
    CASE
      WHEN owner.email IS NOT NULL AND position('@' in owner.email) > 0
      THEN split_part(owner.email, '@', 1)
      ELSE NULL
    END
  )`;

export const ownerPasswordSelect = (plainColumn: string): string => `
  COALESCE(
    NULLIF(TRIM(${plainColumn}), ''),
    NULLIF(TRIM(owner.password_plain), '')
  )`;

import type { Pool, PoolClient } from "pg";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { AppError } from "../middleware/errorHandler";

type Queryable = Pool | PoolClient;

/**
 * School and institute usernames may repeat.
 * The same username with the same password may not.
 */
export async function assertOwnerPasswordAvailable(
  client: Queryable,
  username: string,
  password: string,
  exclude?: { schoolId?: string; instituteId?: string; userId?: string }
): Promise<void> {
  const trimmedUser = username.trim();
  const trimmedPassword = password;
  if (!trimmedUser || !trimmedPassword) return;

  const result = await client.query<{
    password_plain: string | null;
    password_hash: string | null;
  }>(
    `SELECT password_plain, password_hash
     FROM (
       SELECT owner_password_plain AS password_plain, NULL::text AS password_hash
       FROM schools
       WHERE owner_username_plain IS NOT NULL
         AND lower(btrim(owner_username_plain)) = lower(btrim($1))
         AND ($2::uuid IS NULL OR id <> $2::uuid)
       UNION ALL
       SELECT owner_password_plain, NULL::text
       FROM institutes
       WHERE owner_username_plain IS NOT NULL
         AND lower(btrim(owner_username_plain)) = lower(btrim($1))
         AND ($3::uuid IS NULL OR id <> $3::uuid)
       UNION ALL
       SELECT password_plain, password_hash
       FROM users
       WHERE username IS NOT NULL
         AND lower(btrim(username)) = lower(btrim($1))
         AND ($4::uuid IS NULL OR id <> $4::uuid)
     ) accounts`,
    [
      trimmedUser,
      exclude?.schoolId ?? null,
      exclude?.instituteId ?? null,
      exclude?.userId ?? null,
    ]
  );

  for (const row of result.rows) {
    if (row.password_plain && row.password_plain === trimmedPassword) {
      throw new AppError(
        "This username already uses that password. Choose a different password.",
        409
      );
    }
    if (!row.password_plain && row.password_hash) {
      const same = await bcrypt.compare(trimmedPassword, row.password_hash);
      if (same) {
        throw new AppError(
          "This username already uses that password. Choose a different password.",
          409
        );
      }
    }
  }
}

/** Repeated usernames still need a unique email on the users table. */
export async function allocateOwnerEmail(
  client: Queryable,
  preferredEmail: string
): Promise<string> {
  const preferred = preferredEmail.trim().toLowerCase();
  const at = preferred.lastIndexOf("@");
  const local = at > 0 ? preferred.slice(0, at) : preferred;
  const domain = at > 0 ? preferred.slice(at + 1) : "teachers.local";
  const taken = await client.query(`SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1`, [
    preferred,
  ]);
  if (!taken.rows[0]) return preferred;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${local}+${crypto.randomBytes(4).toString("hex")}@${domain}`;
    const exists = await client.query(
      `SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [candidate]
    );
    if (!exists.rows[0]) return candidate;
  }
  throw new AppError("Could not create a login for this username. Try again.", 409);
}

/** Find the best owner user row for credential updates. */
export const findOwnerUserSql = (
  linkColumn: "school_id" | "institute_id"
): string => `
  SELECT id FROM users
  WHERE ${linkColumn} = $1
  ORDER BY COALESCE(is_owner, false) DESC,
           (NULLIF(TRIM(password_plain), '') IS NOT NULL) DESC,
           (NULLIF(TRIM(username), '') IS NOT NULL) DESC,
           created_at ASC NULLS LAST
  LIMIT 1`;
