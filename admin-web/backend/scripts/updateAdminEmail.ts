/**
 * One-time: change admin login/notification email.
 * Run from backend/:
 *   npx tsx scripts/updateAdminEmail.ts
 */
import "dotenv/config";
import { pool } from "../src/config/database";

const OLD_EMAIL = "harsha@harshaidsolutions.com";
const NEW_EMAIL = "harshaidsolutions@gmail.com";

async function main() {
  const result = await pool.query(
    `UPDATE users
     SET email = $1
     WHERE lower(email) = lower($2)
     RETURNING id, email, role`,
    [NEW_EMAIL.toLowerCase(), OLD_EMAIL]
  );

  if (result.rowCount === 0) {
    throw new Error(`No user found with email ${OLD_EMAIL}`);
  }

  const user = result.rows[0] as { id: string; email: string; role: string };
  console.log(
    `OK: email updated ${OLD_EMAIL} → ${user.email} (id=${user.id}, role=${user.role}).`
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(
      "updateAdminEmail failed:",
      error instanceof Error ? error.message : error
    );
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
