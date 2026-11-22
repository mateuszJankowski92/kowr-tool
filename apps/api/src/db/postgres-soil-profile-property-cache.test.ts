import {
  type CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import type { SoilProfilePropertyCacheRecord } from "../features/soil-profiles/soil-profile-property-cache.js";
import {
  PostgresSoilProfilePropertyCache,
  type SoilCacheDatabase,
} from "./postgres-soil-profile-property-cache.js";

const record: SoilProfilePropertyCacheRecord = {
  locationKey: "epsg4326:21.263056:54.086323",
  property: "wv0033",
  longitude: 21.263055578563403,
  latitude: 54.086323011985336,
  predictions: Array.from({ length: 6 }, () => ({ q05: 20, q50: 30, q95: 40 })),
  product: "SoilGrids250m",
  productVersion: "2.0",
  resolutionMeters: 250,
  unit: "10^-2 cm3/cm3 (volumetric percent)",
  sourceUrl: "https://maps.isric.org/mapserv",
  retrievedAt: "2026-11-22T02:14:01.607Z",
};

describe("PostgreSQL soil property cache", () => {
  it("binds predictions as JSON for both insert and conflict update instead of a PostgreSQL array", async () => {
    const queries: CompiledQuery[] = [];
    const database = new Kysely<SoilCacheDatabase>({
      dialect: {
        createDriver: () => new DummyDriver(),
        createAdapter: () => new PostgresAdapter(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      log: (event) => {
        queries.push(event.query);
      },
    });
    try {
      await new PostgresSoilProfilePropertyCache(database).store(record);
      const query = queries[0];
      expect(query?.sql).toContain('on conflict ("location_key", "property") do update');
      const jsonParameters = query?.parameters.filter(
        (value) => typeof value === "string" && value.startsWith("[{"),
      );
      expect(jsonParameters).toHaveLength(2);
      expect(jsonParameters?.map((value) => JSON.parse(String(value)))).toEqual([
        record.predictions,
        record.predictions,
      ]);
      expect(query?.parameters.some(Array.isArray)).toBe(false);
      expect(query?.parameters).toContain(record.locationKey);
      expect(query?.parameters).toContain(record.property);
    } finally {
      await database.destroy();
    }
  });
});
