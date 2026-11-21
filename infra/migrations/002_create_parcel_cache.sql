CREATE TABLE IF NOT EXISTS parcel_cache (
  parcel_identifier TEXT PRIMARY KEY,
  geometry geometry(Geometry, 4326) NOT NULL,
  source TEXT NOT NULL,
  source_payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parcel_cache_geometry_idx
  ON parcel_cache
  USING GIST (geometry);

