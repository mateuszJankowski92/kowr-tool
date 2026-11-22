import type { SoilProfileResponse } from "@kowr/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSoilProfile } from "./soil-profiles";

const prediction = { q05: 10, q50: 20, q95: 30 };
const response: SoilProfileResponse = {
  status: "complete",
  sample: {
    location: { type: "Point", coordinates: [21.55, 52.15] },
    method: "representative-interior-point",
    spatialSupport: "single-soilgrids-cell",
  },
  layers: [
    { topDepthCm: 0, bottomDepthCm: 5 },
    { topDepthCm: 5, bottomDepthCm: 15 },
    { topDepthCm: 15, bottomDepthCm: 30 },
    { topDepthCm: 30, bottomDepthCm: 60 },
    { topDepthCm: 60, bottomDepthCm: 100 },
    { topDepthCm: 100, bottomDepthCm: 200 },
  ].map((depth) => ({
    ...depth,
    sandPercent: prediction,
    siltPercent: prediction,
    clayPercent: prediction,
    soilOrganicCarbonGramsPerKilogram: prediction,
    ph: prediction,
    bulkDensityKilogramsPerCubicDecimeter: prediction,
    waterContent10KpaPercent: prediction,
    waterContent33KpaPercent: prediction,
    waterContent1500KpaPercent: prediction,
    availableWaterCapacity: {
      using33Kpa: { volumetricPercent: 10, millimeters: 5 },
      using10Kpa: { volumetricPercent: 20, millimeters: 10 },
    },
  })) as SoilProfileResponse["layers"],
  provenance: {
    provider: "ISRIC",
    dataset: "SoilGrids250m 2.0",
    resolutionMeters: 250,
    predictionStatistic: "Q0.50",
    uncertaintyInterval: "Q0.05-Q0.95",
    license: "CC BY 4.0",
    sourceUrl: "https://rest.isric.org/soilgrids/v2.0/properties/query",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
  limitations: ["single-representative-location"],
};

afterEach(() => vi.restoreAllMocks());

describe("getSoilProfile", () => {
  it("requests and validates a profile by parcel identifier", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));

    await expect(getSoilProfile("141211_2.0038.102")).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/soil-profiles?parcelIdentifier=141211_2.0038.102",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
