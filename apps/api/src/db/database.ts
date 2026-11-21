import { Pool } from "pg";
import { env } from "../config/env.js";

export interface Database {
  ping(): Promise<void>;
  close(): Promise<void>;
}

export class PostgresDatabase implements Database {
  readonly #pool: Pool;

  constructor(connectionString = env.DATABASE_URL) {
    this.#pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 3_000,
    });
  }

  async ping(): Promise<void> {
    await this.#pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
