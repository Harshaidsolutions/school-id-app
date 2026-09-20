/**
 * One-time admin password reset.
 * Edit NEW_PASSWORD below, then run from backend/:
 *   npx tsx scripts/resetAdminPassword.ts
 *
 * Does not print the plaintext or hash.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../src/config/database";

/** Edit this before running. */
const NEW_PASSWORD = "CHANGE_ME_BEFORE_RUNNING";

const ADMIN_EMAIL = "harsha@harshaidsolutions.com";
/** Same as authController.ts login / register hashing. */
const SALT_ROUNDS = 10;

async function main() {
  if (!NEW_PASSWORD || NEW_PASSWORD === "CHANGE_ME_BEFORE_RUNNING") {
    throw new Error("Set NEW_PASSWORD at the top of this script before running.");
  }
  if (NEW_PASSWORD.length < 8) {
    throw new Error("NEW_PASSWORD must be at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, SALT_ROUNDS);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE lower(email) = lower($2)
     RETURNING id, email, role`,
    [passwordHash, ADMIN_EMAIL]
  );

  if (result.rowCount === 0) {
    throw new Error(`No user found with email ${ADMIN_EMAIL}`);
  }

  const user = result.rows[0] as { id: string; email: string; role: string };
  console.log(
    `OK: password updated for ${user.email} (id=${user.id}, role=${user.role}).`
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("resetAdminPassword failed:", error instanceof Error ? error.message : error);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
