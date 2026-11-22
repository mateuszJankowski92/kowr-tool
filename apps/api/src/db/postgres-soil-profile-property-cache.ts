import type { JSONColumnType, Kysely } from "kysely";
import type {
  SoilProfilePropertyCache,
  SoilProfilePropertyCacheRecord,
} from "../features/soil-profiles/soil-profile-property-cache.js";
import type { SoilProfilePrediction } from "../features/soil-profiles/soil-profile-provider.js";

type SoilGridsPropertyCacheTable = {
  location_key: string;
  property: string;
  longitude: number;
  latitude: number;
  predictions: JSONColumnType<SoilProfilePrediction[]>;
  product: string;
  product_version: string;
  resolution_meters: number;
  unit: string;
  source_url: string;
  retrieved_at: Date;
};

export type SoilCacheDatabase = {
  soilgrids_property_cache: SoilGridsPropertyCacheTable;
};

export class PostgresSoilProfilePropertyCache implements SoilProfilePropertyCache {
  constructor(private readonly database: Kysely<SoilCacheDatabase>) {}

  async find(
    key: Pick<SoilProfilePropertyCacheRecord, "locationKey" | "property">,
  ): Promise<SoilProfilePropertyCacheRecord | null> {
    const row = await this.database
      .selectFrom("soilgrids_property_cache")
      .selectAll()
      .where("location_key", "=", key.locationKey)
      .where("property", "=", key.property)
      .executeTakeFirst();
    if (!row) return null;

    return {
      locationKey: row.location_key,
      property: row.property,
      longitude: row.longitude,
      latitude: row.latitude,
      predictions: row.predictions,
      product: row.product,
      productVersion: row.product_version,
      resolutionMeters: row.resolution_meters,
      unit: row.unit,
      sourceUrl: row.source_url,
      retrievedAt: row.retrieved_at.toISOString(),
    };
  }

  async store(record: SoilProfilePropertyCacheRecord): Promise<void> {
    // node-postgres serializes JavaScript arrays as PostgreSQL arrays, rather than JSONB.
    const predictions = JSON.stringify(record.predictions);
    await this.database
      .insertInto("soilgrids_property_cache")
      .values({
        location_key: record.locationKey,
        property: record.property,
        longitude: record.longitude,
        latitude: record.latitude,
        predictions,
        product: record.product,
        product_version: record.productVersion,
        resolution_meters: record.resolutionMeters,
        unit: record.unit,
        source_url: record.sourceUrl,
        retrieved_at: new Date(record.retrievedAt),
      })
      .onConflict((conflict) =>
        conflict.columns(["location_key", "property"]).doUpdateSet({
          predictions,
          product: record.product,
          product_version: record.productVersion,
          resolution_meters: record.resolutionMeters,
          unit: record.unit,
          source_url: record.sourceUrl,
          retrieved_at: new Date(record.retrievedAt),
        }),
      )
      .execute();
  }
}
