import type { TerrainContextResponse } from "@kowr/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTerrainContext } from "./terrain-context";

const response: TerrainContextResponse = {
  status: "partial",
  parcelIdentifier: "141201_1.0001.6509",
  terrain: {
    status: "available",
    metrics: {
      minimumElevationMeters: 101,
      maximumElevationMeters: 103,
      elevationRangeMeters: 2,
      typicalSlopeDegrees: 1.5,
      steepSlopeP90Degrees: 2.4,
      dominantAspect: "W",
      sampledCellCount: 4,
      slopeSampleCount: 1,
    },
    grid: {
      columns: 2,
      rows: 2,
      bounds: { west: 1, south: 1, east: 3, north: 3 },
      cellSizeMeters: 1,
      heightsMeters: [101, 102, 102, 103],
    },
    parcelGeometry: {
      type: "Polygon",
      coordinates: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
    },
    verticalScale: 1,
    source: {
      provider: "GUGiK",
      dataset: "Numeryczny Model Terenu",
      horizontalCrs: "EPSG:2180",
      verticalReference: "PL-EVRF2007-NH",
      sourceDataDate: null,
      retrievedAt: "2026-11-21T12:00:00.000Z",
      usageTerms: "Free use under the Polish Geodetic and Cartographic Law",
    },
    limitations: ["Resampled grid."],
  },
  surroundings: {
    hydrology: { status: "unavailable", reason: "no-data", message: "Hydrology unavailable." },
    landUse: { status: "unavailable", reason: "no-data", message: "Land use unavailable." },
  },
};

afterEach(() => vi.restoreAllMocks());

describe("getTerrainContext", () => {
  it("requests and validates terrain by parcel identifier", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));

    await expect(getTerrainContext("141201_1.0001.6509")).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/terrain-contexts?parcelIdentifier=141201_1.0001.6509",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
