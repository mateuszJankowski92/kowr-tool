import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { env } from "../config/env.js";
import type { SoilProfilePropertyCache } from "../features/soil-profiles/soil-profile-property-cache.js";
import {
  PostgresSoilProfilePropertyCache,
  type SoilCacheDatabase,
} from "./postgres-soil-profile-property-cache.js";

export interface Database {
  readonly soilProfilePropertyCache?: SoilProfilePropertyCache;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export class PostgresDatabase implements Database {
  readonly #database: Kysely<SoilCacheDatabase>;
  readonly soilProfilePropertyCache: SoilProfilePropertyCache;

  constructor(connectionString = env.DATABASE_URL) {
    this.#database = new Kysely<SoilCacheDatabase>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString,
          max: 10,
          connectionTimeoutMillis: 3_000,
        }),
      }),
    });
    this.soilProfilePropertyCache = new PostgresSoilProfilePropertyCache(this.#database);
  }

  async ping(): Promise<void> {
    await sql`SELECT 1`.execute(this.#database);
  }

  async close(): Promise<void> {
    await this.#database.destroy();
  }
}
