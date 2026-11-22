CREATE TABLE IF NOT EXISTS soilgrids_property_cache (
  location_key TEXT NOT NULL,
  property TEXT NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  predictions JSONB NOT NULL,
  product TEXT NOT NULL,
  product_version TEXT NOT NULL,
  resolution_meters INTEGER NOT NULL,
  unit TEXT NOT NULL,
  source_url TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (location_key, property)
);

COMMENT ON TABLE soilgrids_property_cache IS
  'Persistent source-data cache for immutable SoilGrids properties at an exact sampled location.';
