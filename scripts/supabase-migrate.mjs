import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;

loadEnvConfig(process.cwd());

const connectionString = process.env.SUPABASE_DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "Missing SUPABASE_DATABASE_URL. Copy the Session pooler connection string from Supabase Dashboard > Connect into .env.",
  );
  process.exit(1);
}
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  console.error(
    "SUPABASE_DATABASE_URL is not a PostgreSQL URI. In Supabase Dashboard, open Connect > Session pooler and copy the URI that starts with postgresql://.",
  );
  process.exit(1);
}

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260614_create_registration_and_appointments.sql",
    import.meta.url,
  ),
  "utf8",
);

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: false },
  application_name: "wzlcf-migration",
});

try {
  await pool.query(migration);
  const result = await pool.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('registered_users', 'appointments')
    order by table_name
  `);
  console.log(
    `Supabase migration complete: ${result.rows.map((row) => row.table_name).join(", ")}`,
  );
} finally {
  await pool.end();
}
