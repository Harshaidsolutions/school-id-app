/** Read-only: run on EC2 with the backend environment; never prints passwords/hashes. */
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../src/config/database";

async function main() {
  const username = process.argv[2]?.trim();
  if (!username) throw new Error('Usage: npx tsx scripts/diagnoseMobileLogin.ts "USERNAME"');
  const { rows } = await pool.query(`
    SELECT u.id, u.role, u.is_active, u.is_owner, u.password_hash,
      COALESCE(s.name, i.name, o.name) AS organization_name,
      COALESCE(s.is_active, i.is_active, o.is_active) AS organization_active,
      CASE WHEN u.role = 'teacher' THEN s.owner_password_plain
           WHEN u.role = 'institute_staff' THEN i.owner_password_plain
           WHEN u.role = 'organization_staff' THEN o.owner_password_plain END AS displayed_password,
      CASE WHEN u.role = 'teacher' THEN s.owner_username_plain
           WHEN u.role = 'institute_staff' THEN i.owner_username_plain
           WHEN u.role = 'organization_staff' THEN o.owner_username_plain END AS displayed_username
    FROM users u
    LEFT JOIN schools s ON s.id = u.school_id
    LEFT JOIN institutes i ON i.id = u.institute_id
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE lower(btrim(u.username)) = lower($1) OR lower(btrim(u.email)) = lower($1)
      OR (u.is_owner = true AND (lower(btrim(s.owner_username_plain)) = lower($1)
        OR lower(btrim(i.owner_username_plain)) = lower($1) OR lower(btrim(o.owner_username_plain)) = lower($1)))
  `, [username]);
  if (!rows.length) { console.log("No matching login account in this database."); return; }
  for (const row of rows) {
    let matches: boolean | null = null;
    if (row.is_owner && row.displayed_password && row.password_hash) {
      matches = await bcrypt.compare(row.displayed_password, row.password_hash).catch(() => false);
    }
    console.log(JSON.stringify({
      accountId: row.id, role: row.role, active: row.is_active,
      organization: row.organization_name, organizationActive: row.organization_active,
      isOwner: row.is_owner, displayedUsernameMatches: row.displayed_username?.trim().toLowerCase() === username.toLowerCase(),
      displayedOwnerPasswordMatchesLoginHash: matches,
    }));
  }
  console.log("Read-only check complete. No credentials or database records were changed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Diagnostic failed"); process.exitCode = 1; }).finally(() => pool.end());
