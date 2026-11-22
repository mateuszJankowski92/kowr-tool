export type SoilProfilePrediction = {
  q05: number | null;
  q50: number | null;
  q95: number | null;
};

export type SoilProfileLayer = {
  topDepthCm: number;
  bottomDepthCm: number;
  sandPercent: SoilProfilePrediction;
  siltPercent: SoilProfilePrediction;
  clayPercent: SoilProfilePrediction;
  soilOrganicCarbonGramsPerKilogram: SoilProfilePrediction;
  ph: SoilProfilePrediction;
  bulkDensityKilogramsPerCubicDecimeter: SoilProfilePrediction;
  waterContent10KpaPercent: SoilProfilePrediction;
  waterContent33KpaPercent: SoilProfilePrediction;
  waterContent1500KpaPercent: SoilProfilePrediction;
};

export type SoilProfileLayers = [
  SoilProfileLayer,
  SoilProfileLayer,
  SoilProfileLayer,
  SoilProfileLayer,
  SoilProfileLayer,
  SoilProfileLayer,
];

export type ProvidedSoilProfile = {
  layers: SoilProfileLayers;
  retrievedAt: string;
  sourceUrl: string;
};

export class SoilProfileProviderError extends Error {
  readonly code: "INVALID_RESPONSE" | "REQUEST_FAILED" | "TIMEOUT";

  constructor(code: SoilProfileProviderError["code"], cause?: unknown) {
    super("The soil profile provider request could not be completed.", { cause });
    this.name = "SoilProfileProviderError";
    this.code = code;
  }
}

export interface SoilProfileProvider {
  getProfile(
    longitude: number,
    latitude: number,
    signal?: AbortSignal,
  ): Promise<ProvidedSoilProfile>;
  getWaterProfile?(
    longitude: number,
    latitude: number,
    signal?: AbortSignal,
  ): Promise<ProvidedSoilProfile>;
}
