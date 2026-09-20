import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL is not set");
}

/**
 * Newer `pg` treats sslmode=require as verify-full, which fails against
 * RDS / managed Postgres CA chains. Strip sslmode and disable CA verification
 * for remote URLs (keep localhost without forced TLS).
 */
function poolConfigFromDatabaseUrl(connectionString: string | undefined) {
  if (!connectionString) {
    return { connectionString };
  }

  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  if (isLocal) {
    return { connectionString };
  }

  let cleaned = connectionString;
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("uselibpqcompat");
    cleaned = u.toString();
  } catch {
    cleaned = connectionString
      .replace(/([?&])sslmode=[^&]*/gi, "$1")
      .replace(/[?&]$/, "")
      .replace(/\?&/, "?")
      .replace(/&&+/g, "&");
  }

  return {
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false as const },
  };
}

export const pool = new Pool(poolConfigFromDatabaseUrl(process.env.DATABASE_URL));

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}
