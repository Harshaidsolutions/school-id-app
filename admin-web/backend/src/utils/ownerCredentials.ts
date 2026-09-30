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

import type { PoolClient } from "pg";
import { AppError } from "../middleware/errorHandler";

/** Username only. School and institute names are not part of this check. */
export async function assertOwnerUsernameAvailable(
  client: PoolClient,
  username: string
): Promise<void> {
  const taken = await client.query(
    `SELECT 1
     FROM users
     WHERE username IS NOT NULL AND lower(btrim(username)) = lower(btrim($1))
     UNION ALL
     SELECT 1
     FROM schools
     WHERE owner_username_plain IS NOT NULL
       AND lower(btrim(owner_username_plain)) = lower(btrim($1))
     UNION ALL
     SELECT 1
     FROM institutes
     WHERE owner_username_plain IS NOT NULL
       AND lower(btrim(owner_username_plain)) = lower(btrim($1))
     LIMIT 1`,
    [username]
  );
  if (taken.rows[0]) {
    throw new AppError(
      "This username is already in use. Choose a different username.",
      409
    );
  }
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
