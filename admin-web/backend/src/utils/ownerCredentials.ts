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
