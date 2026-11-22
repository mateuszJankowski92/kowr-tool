import type { SoilProfilePrediction } from "./soil-profile-provider.js";

export type SoilProfilePropertyCacheKey = {
  locationKey: string;
  property: string;
};

export type SoilProfilePropertyCacheRecord = SoilProfilePropertyCacheKey & {
  longitude: number;
  latitude: number;
  predictions: SoilProfilePrediction[];
  product: string;
  productVersion: string;
  resolutionMeters: number;
  unit: string;
  sourceUrl: string;
  retrievedAt: string;
};

export interface SoilProfilePropertyCache {
  find(key: SoilProfilePropertyCacheKey): Promise<SoilProfilePropertyCacheRecord | null>;
  store(record: SoilProfilePropertyCacheRecord): Promise<void>;
}
