import type { HydrologyFeature, LandUseFeature } from "@kowr/analysis";
import type { ParcelGeometry } from "@kowr/contracts";

export type ProvidedSurroundings = {
  searchRadiusMeters: number;
  hydrologyFeatures: HydrologyFeature[];
  landUseFeatures: LandUseFeature[];
  source: {
    snapshotAt: string;
    retrievedAt: string;
    sourceUrl: string;
  };
};

export class SurroundingsProviderError extends Error {
  readonly code: "INVALID_RESPONSE" | "REQUEST_FAILED" | "TIMEOUT";

  constructor(code: SurroundingsProviderError["code"], cause?: unknown) {
    super("The parcel surroundings provider request could not be completed.", { cause });
    this.name = "SurroundingsProviderError";
    this.code = code;
  }
}

export interface SurroundingsProvider {
  getFeatures(geometry: ParcelGeometry, signal?: AbortSignal): Promise<ProvidedSurroundings>;
}
