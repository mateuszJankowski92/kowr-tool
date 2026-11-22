import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { env } from "../config/env.js";

const migrationsDirectory = env.MIGRATIONS_DIRECTORY
  ? resolve(env.MIGRATIONS_DIRECTORY)
  : fileURLToPath(new URL("../../../../infra/migrations/", import.meta.url));

const pool = new Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const existing = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [file],
    );

    if (existing.rowCount && existing.rowCount > 0) continue;

    const sql = await readFile(new URL(file, `file://${migrationsDirectory}/`), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.info(`Applied migration: ${file}`);
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
