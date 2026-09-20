/**
 * Compare public-table row counts between SOURCE_DATABASE_URL and TARGET_DATABASE_URL.
 *
 *   npx tsx scripts/verifyDbCounts.ts
 */
import "dotenv/config";
import { Pool } from "pg";

const SOURCE =
  process.env.SOURCE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
const TARGET = process.env.TARGET_DATABASE_URL?.trim();

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function stripSslModeParams(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch {
    return connectionString
      .replace(/([?&])sslmode=[^&]*/gi, "$1")
      .replace(/[?&]$/, "")
      .replace(/\?&/, "?")
      .replace(/&&+/g, "&");
  }
}

function poolOptions(connectionString: string, max: number) {
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  return {
    connectionString: isLocal
      ? connectionString
      : stripSslModeParams(connectionString),
    ssl: isLocal ? undefined : ({ rejectUnauthorized: false } as const),
    max,
  };
}

async function counts(url: string): Promise<Map<string, number>> {
  const pool = new Pool(poolOptions(url, 1));
  try {
    const tables = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`
    );
    const map = new Map<string, number>();
    for (const { tablename } of tables.rows) {
      const c = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${quoteIdent(tablename)}`
      );
      map.set(tablename, Number(c.rows[0].n));
    }
    return map;
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!SOURCE || !TARGET) {
    throw new Error("SOURCE_DATABASE_URL (or DATABASE_URL) and TARGET_DATABASE_URL required");
  }

  console.log("Fetching source counts…");
  const src = await counts(SOURCE);
  console.log("Fetching target counts…");
  const tgt = await counts(TARGET);

  const names = [...new Set([...src.keys(), ...tgt.keys()])].sort();
  console.log("\nTable".padEnd(32) + "Source".padStart(10) + "Target".padStart(10) + "  Status");
  console.log("-".repeat(60));
  let bad = 0;
  for (const name of names) {
    const a = src.get(name);
    const b = tgt.get(name);
    let status = "OK";
    if (a === undefined) status = "MISSING ON SOURCE";
    else if (b === undefined) status = "MISSING ON TARGET";
    else if (a !== b) status = "MISMATCH";
    if (status !== "OK") bad += 1;
    console.log(
      name.padEnd(32) +
        String(a ?? "-").padStart(10) +
        String(b ?? "-").padStart(10) +
        "  " +
        status
    );
  }

  const sourcePool = new Pool(poolOptions(TARGET, 1));
  try {
    const schools = await sourcePool.query<{ name: string; n: string }>(
      `SELECT s.name, COUNT(st.id)::text AS n
       FROM schools s
       LEFT JOIN students st ON st.school_id = s.id
       GROUP BY s.name
       ORDER BY s.name`
    );
    console.log("\nTarget schools:");
    for (const s of schools.rows) {
      console.log(`  - ${s.name}: ${s.n} students`);
    }
  } finally {
    await sourcePool.end();
  }

  if (bad > 0) {
    console.error(`\n${bad} problem(s) found.`);
    process.exit(1);
  }
  console.log("\nAll counts match.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
