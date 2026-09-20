/**
 * Print admin accounts and school/institute ownership (run on EC2 after migrate).
 *
 *   npm run diagnose:admin-scope
 */
import "dotenv/config";
import { pool } from "../src/config/database";
import { queryAdminSeesAllOrganizations } from "../src/utils/adminScope";

async function main() {
  const admins = await pool.query<{
    id: string;
    email: string;
    username: string | null;
    is_super_admin: boolean | null;
    created_at: Date | null;
  }>(
    `SELECT id, email, username, COALESCE(is_super_admin, false) AS is_super_admin, created_at
     FROM users WHERE role = 'admin'
     ORDER BY created_at ASC NULLS LAST`
  );

  const totals = await pool.query<{ schools: string; institutes: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM schools) AS schools,
       (SELECT COUNT(*)::text FROM institutes) AS institutes`
  );

  console.log("Totals:", totals.rows[0]);
  console.log("\nAdmin accounts:");
  for (const a of admins.rows) {
    const seeAll = await queryAdminSeesAllOrganizations(a.id);
    const owned = await pool.query<{ schools: string; institutes: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM schools WHERE owner_admin_id = $1) AS schools,
         (SELECT COUNT(*)::text FROM institutes WHERE owner_admin_id = $1) AS institutes`,
      [a.id]
    );
    console.log({
      id: a.id,
      email: a.email,
      username: a.username,
      is_super_admin: a.is_super_admin,
      created_at: a.created_at,
      seesAllOrganizations: seeAll,
      owned: owned.rows[0],
    });
  }

  const orphanSchools = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM schools WHERE owner_admin_id IS NULL`
  );
  console.log("\nSchools with NULL owner_admin_id:", orphanSchools.rows[0]?.n);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
