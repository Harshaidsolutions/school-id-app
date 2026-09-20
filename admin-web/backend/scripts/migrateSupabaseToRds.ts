/**
 * Migrate public schema + data from SOURCE_DATABASE_URL → TARGET_DATABASE_URL
 * using only the `pg` driver (no pg_dump required).
 *
 * Safety:
 *  - Never drops the source database
 *  - Refuses to write if target already has rows in core tables (unless --force)
 *  - Copies in FK-safe order; verifies counts after
 *
 * Usage:
 *   set SOURCE_DATABASE_URL / TARGET_DATABASE_URL (or pass via env)
 *   npx tsx scripts/migrateSupabaseToRds.ts
 *   npx tsx scripts/migrateSupabaseToRds.ts -- --force
 *   npx tsx scripts/migrateSupabaseToRds.ts -- --dry-run
 */
import "dotenv/config";
import { Pool, type PoolClient } from "pg";

const SOURCE =
  process.env.SOURCE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
const TARGET = process.env.TARGET_DATABASE_URL?.trim();

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

/** Prefer this order; any remaining public tables are appended alphabetically. */
const PREFERRED_ORDER = [
  "institutes",
  "schools",
  "users",
  "templates",
  "import_batches",
  "students",
  "notifications",
  "notification_reads",
  "print_batches",
  "password_reset_otps",
  "password_reset_tokens",
  "institute_members",
  "activity_log",
  "form_configs",
  "contact_inquiries",
  "demo_requests",
];

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function stripSslModeParams(connectionString: string): string {
  // Newer `pg` treats sslmode=require as verify-full, which ignores rejectUnauthorized.
  // Strip sslmode so the explicit ssl option below controls TLS verification.
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

/** TLS for one-time migration / verify — do not verify CA chain (Supabase pooler + RDS). */
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

async function listPublicTables(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`
  );
  return rows.map((r) => r.tablename);
}

async function countRows(client: PoolClient, table: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${quoteIdent(table)}`
  );
  return Number(rows[0].n);
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return rows[0].exists;
}

/**
 * Build CREATE TABLE / indexes / constraints DDL for one table via pg_dump-less
 * approach: use PostgreSQL's own catalog helpers where possible.
 * We recreate by copying column definitions + PK + unique + check + FK + indexes.
 */
async function getCreateTableDdl(
  client: PoolClient,
  table: string
): Promise<string> {
  // Columns
  const cols = await client.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, udt_name, character_maximum_length,
            numeric_precision, numeric_scale, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );

  if (cols.rows.length === 0) {
    throw new Error(`No columns found for public.${table}`);
  }

  const colDefs = cols.rows.map((c) => {
    let typeSql: string;
    if (c.data_type === "ARRAY") {
      typeSql = `${c.udt_name.replace(/^_/, "")}[]`;
    } else if (c.data_type === "USER-DEFINED") {
      typeSql = c.udt_name;
    } else if (c.data_type === "character varying") {
      typeSql = c.character_maximum_length
        ? `character varying(${c.character_maximum_length})`
        : "character varying";
    } else if (c.data_type === "numeric" && c.numeric_precision != null) {
      typeSql =
        c.numeric_scale != null
          ? `numeric(${c.numeric_precision},${c.numeric_scale})`
          : `numeric(${c.numeric_precision})`;
    } else if (c.data_type === "timestamp with time zone") {
      typeSql = "timestamptz";
    } else if (c.data_type === "timestamp without time zone") {
      typeSql = "timestamp";
    } else {
      typeSql = c.data_type;
    }

    let def = `${quoteIdent(c.column_name)} ${typeSql}`;
    if (c.column_default != null) {
      def += ` DEFAULT ${c.column_default}`;
    }
    if (c.is_nullable === "NO") {
      def += " NOT NULL";
    }
    return def;
  });

  // Primary key
  const pk = await client.query<{ columns: string }>(
    `SELECT string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) AS columns
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     GROUP BY tc.constraint_name`,
    [table]
  );
  if (pk.rows[0]?.columns) {
    colDefs.push(`PRIMARY KEY (${pk.rows[0].columns})`);
  }

  // Unique constraints (non-PK)
  const uniques = await client.query<{
    constraint_name: string;
    columns: string;
  }>(
    `SELECT tc.constraint_name,
            string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) AS columns
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'UNIQUE'
     GROUP BY tc.constraint_name`,
    [table]
  );
  for (const u of uniques.rows) {
    colDefs.push(
      `CONSTRAINT ${quoteIdent(u.constraint_name)} UNIQUE (${u.columns})`
    );
  }

  // Check constraints (table-level)
  const checks = await client.query<{
    constraint_name: string;
    check_clause: string;
  }>(
    `SELECT cc.constraint_name, cc.check_clause
     FROM information_schema.check_constraints cc
     JOIN information_schema.table_constraints tc
       ON cc.constraint_name = tc.constraint_name
      AND cc.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'CHECK'
       AND cc.check_clause NOT ILIKE '%IS NOT NULL%'`,
    [table]
  );
  for (const ch of checks.rows) {
    colDefs.push(
      `CONSTRAINT ${quoteIdent(ch.constraint_name)} CHECK (${ch.check_clause})`
    );
  }

  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n  ${colDefs.join(",\n  ")}\n);`;
}

async function getForeignKeys(
  client: PoolClient,
  table: string
): Promise<string[]> {
  const { rows } = await client.query<{
    conname: string;
    def: string;
  }>(
    `SELECT con.conname,
            pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public'
       AND rel.relname = $1
       AND con.contype = 'f'`,
    [table]
  );

  return rows.map(
    (r) =>
      `ALTER TABLE ${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(r.conname)} ${r.def};`
  );
}

async function getIndexDdl(
  client: PoolClient,
  table: string
): Promise<string[]> {
  // Non-constraint indexes only (PKs/UNIQUEs already covered)
  const { rows } = await client.query<{ indexdef: string }>(
    `SELECT indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = $1
       AND indexname NOT IN (
         SELECT constraint_name
         FROM information_schema.table_constraints
         WHERE table_schema = 'public'
           AND table_name = $1
           AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')
       )`,
    [table]
  );
  return rows.map((r) => {
    // Make idempotent
    const def = r.indexdef;
    if (def.toUpperCase().startsWith("CREATE UNIQUE INDEX ")) {
      return def.replace(/^CREATE UNIQUE INDEX /i, "CREATE UNIQUE INDEX IF NOT EXISTS ");
    }
    if (def.toUpperCase().startsWith("CREATE INDEX ")) {
      return def.replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS ");
    }
    return def;
  });
}

function orderTables(tables: string[]): string[] {
  const set = new Set(tables);
  const ordered: string[] = [];
  for (const name of PREFERRED_ORDER) {
    if (set.has(name)) {
      ordered.push(name);
      set.delete(name);
    }
  }
  for (const name of [...set].sort()) {
    ordered.push(name);
  }
  return ordered;
}

async function copyTableData(
  source: PoolClient,
  target: PoolClient,
  table: string
): Promise<number> {
  const colsResult = await source.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  const columns = colsResult.rows.map((r) => r.column_name);
  if (columns.length === 0) return 0;

  const colList = columns.map(quoteIdent).join(", ");
  const { rows } = await source.query(
    `SELECT ${colList} FROM ${quoteIdent(table)}`
  );
  if (rows.length === 0) return 0;

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const insertSql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  // Batch in transactions for speed
  await target.query("BEGIN");
  try {
    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      await target.query(insertSql, values);
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK");
    throw error;
  }

  return rows.length;
}

async function main() {
  if (!SOURCE) {
    throw new Error("SOURCE_DATABASE_URL or DATABASE_URL is required");
  }
  if (!TARGET) {
    throw new Error("TARGET_DATABASE_URL is required");
  }

  console.log("Source:", SOURCE.replace(/:([^:@/]+)@/, ":***@"));
  console.log("Target:", TARGET.replace(/:([^:@/]+)@/, ":***@"));
  if (dryRun) console.log("DRY RUN — no writes to target\n");

  const sourcePool = new Pool(poolOptions(SOURCE, 2));
  const targetPool = new Pool(poolOptions(TARGET, 2));

  const source = await sourcePool.connect();
  const target = await targetPool.connect();

  try {
    await source.query("SELECT 1");
    await target.query("SELECT 1");
    console.log("Both databases reachable.\n");

    const sourceTables = orderTables(await listPublicTables(source));
    console.log("Source public tables:", sourceTables.join(", "));

    // Safety: refuse if target already has student/school data unless --force
    if (!dryRun && !force) {
      for (const core of ["schools", "students", "users"]) {
        if (await tableExists(target, core)) {
          const n = await countRows(target, core);
          if (n > 0) {
            throw new Error(
              `Target already has ${n} row(s) in ${core}. Re-run with --force to proceed anyway (will INSERT … ON CONFLICT DO NOTHING; will not wipe target).`
            );
          }
        }
      }
    }

    if (!dryRun) {
      await target.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
      await target.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      console.log("Extensions ready on target.");
    }

    // 1) Create tables (without FKs first)
    for (const table of sourceTables) {
      const ddl = await getCreateTableDdl(source, table);
      console.log(`\n── Schema: ${table}`);
      if (dryRun) {
        console.log(ddl.slice(0, 200) + (ddl.length > 200 ? "…" : ""));
        continue;
      }
      await target.query(ddl);
      console.log(`  created (or existed)`);
    }

    // 2) Indexes
    for (const table of sourceTables) {
      const indexes = await getIndexDdl(source, table);
      if (dryRun) {
        for (const idx of indexes) console.log(`  index: ${idx.slice(0, 120)}…`);
        continue;
      }
      for (const idx of indexes) {
        try {
          await target.query(idx);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          // Likely already exists
          if (!/already exists/i.test(msg)) {
            console.warn(`  index warn (${table}): ${msg}`);
          }
        }
      }
    }

    // 3) Foreign keys (after all tables exist)
    for (const table of sourceTables) {
      const fks = await getForeignKeys(source, table);
      for (const fk of fks) {
        if (dryRun) {
          console.log(`  fk: ${fk.slice(0, 140)}…`);
          continue;
        }
        try {
          await target.query(fk);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!/already exists/i.test(msg)) {
            console.warn(`  fk warn (${table}): ${msg}`);
          }
        }
      }
    }

    // 4) Data
    console.log("\n── Copying data ──");
    const summary: { table: string; source: number; copied: number; target: number }[] =
      [];

    for (const table of sourceTables) {
      const srcCount = await countRows(source, table);
      let copied = 0;
      if (!dryRun) {
        copied = await copyTableData(source, target, table);
      }
      const tgtCount = dryRun
        ? 0
        : (await tableExists(target, table))
          ? await countRows(target, table)
          : 0;
      summary.push({
        table,
        source: srcCount,
        copied: dryRun ? srcCount : copied,
        target: tgtCount,
      });
      console.log(
        `  ${table.padEnd(28)} source=${srcCount}  copied=${dryRun ? "(dry-run)" : copied}  target=${dryRun ? "n/a" : tgtCount}`
      );
    }

    console.log("\n── Verification ──");
    let mismatch = 0;
    for (const row of summary) {
      if (!dryRun && row.source !== row.target) {
        mismatch += 1;
        console.log(
          `  MISMATCH ${row.table}: source=${row.source} target=${row.target}`
        );
      }
    }
    if (!dryRun && mismatch === 0) {
      console.log("  All table row counts match.");
    }

    if (!dryRun) {
      const schools = await target.query<{ name: string; n: string }>(
        `SELECT s.name, COUNT(st.id)::text AS n
         FROM schools s
         LEFT JOIN students st ON st.school_id = s.id
         GROUP BY s.name
         ORDER BY s.name`
      );
      console.log("\nSchools on target (with student counts):");
      for (const s of schools.rows) {
        console.log(`  - ${s.name}: ${s.n} students`);
      }
    }
  } finally {
    source.release();
    target.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((error) => {
  console.error("\nMigration failed:", error);
  process.exit(1);
});
