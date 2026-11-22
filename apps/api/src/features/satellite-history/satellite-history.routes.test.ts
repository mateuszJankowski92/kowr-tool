import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import {
  type SatelliteHistoryProvider,
  SatelliteHistoryProviderError,
} from "./satellite-history-provider.js";

const database: Database = { close: vi.fn(), ping: vi.fn() };
const geometry = {
  type: "Polygon" as const,
  coordinates: [
    [
      [17.29, 52.19] as [number, number],
      [17.31, 52.19] as [number, number],
      [17.31, 52.21] as [number, number],
      [17.29, 52.19] as [number, number],
    ],
  ],
};

function provider(): SatelliteHistoryProvider {
  return {
    getObservationSeries: vi.fn().mockResolvedValue({
      limitations: [],
      observations: [],
      provenance: {
        collection: "sentinel-2-l2a",
        license: "Contains modified Copernicus Sentinel data",
        provider: "Copernicus Data Space Ecosystem",
        retrievedAt: "2026-11-21T12:00:00Z",
        sourceUrl: "https://stac.dataspace.copernicus.eu/v1/search",
      },
      status: "complete",
    }),
    getHistory: vi.fn().mockResolvedValue({
      indicator: "ndmi",
      limitations: [],
      observations: [],
      provenance: {
        collection: "sentinel-2-l2a",
        license: "Contains modified Copernicus Sentinel data",
        provider: "Copernicus Data Space Ecosystem",
        retrievedAt: "2026-11-21T12:00:00Z",
        sourceUrl: "https://stac.dataspace.copernicus.eu/v1/search",
      },
      status: "complete",
      year: 2025,
    }),
    getFrame: vi.fn().mockResolvedValue({
      bounds: [17.29, 52.19, 17.31, 52.21],
      imageBase64: "iVBORw==",
      layer: "ndmi",
      mediaType: "image/png",
      observationDate: "2025-06-10",
      provenance: {
        collection: "sentinel-2-l2a",
        license: "Contains modified Copernicus Sentinel data",
        provider: "Copernicus Data Space Ecosystem",
        retrievedAt: "2026-11-21T12:00:00Z",
        sourceUrl: "https://stac.dataspace.copernicus.eu/v1/search",
      },
    }),
  };
}

describe("satellite history routes", () => {
  it("validates and returns observation history", async () => {
    const satelliteHistoryProvider = provider();
    const app = await createApp({ database, logger: false, satelliteHistoryProvider });

    const response = await app.inject({
      method: "POST",
      url: "/api/satellite-history",
      payload: { geometry, indicator: "ndmi", throughDate: "2026-11-21", year: 2025 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ year: 2025, status: "complete" });
    expect(satelliteHistoryProvider.getHistory).toHaveBeenCalledWith(
      geometry,
      2025,
      "2026-11-21",
      "ndmi",
      undefined,
    );
    await app.close();
  });

  it("selects satellite observations for a bounded period before the analysis date", async () => {
    const satelliteHistoryProvider = provider();
    const app = await createApp({ database, logger: false, satelliteHistoryProvider });

    const response = await app.inject({
      method: "POST",
      url: "/api/satellite-observations/summary",
      payload: { analysisDate: "2026-01-10", geometry },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analysisDate: "2026-01-10",
      history: [],
      searchPeriod: { from: "2025-11-11", maxLookbackDays: 60, to: "2026-01-10" },
      status: "unavailable",
      trend: { direction: "insufficient", observationCount: 0 },
    });
    expect(satelliteHistoryProvider.getObservationSeries).toHaveBeenCalledWith(
      geometry,
      "2025-11-11",
      "2026-01-10",
      undefined,
    );
    await app.close();
  });

  it("reuses the fetched parcel series as qualified NDMI history", async () => {
    const satelliteHistoryProvider = provider();
    vi.mocked(satelliteHistoryProvider.getObservationSeries).mockResolvedValue({
      limitations: [],
      observations: [
        {
          acquiredAt: "2026-01-08T10:00:00Z",
          date: "2026-01-08",
          id: "observation-1",
          indicators: {
            ndmi: {
              median: 0.27,
              quality: {
                assessment: "sufficient",
                geometryPixelCount: 100,
                thresholdPercent: 70,
                validPixelCount: 84,
                rejectedPixelCounts: null,
              },
              validPixelPercent: 84,
            },
            ndvi: { median: null, quality: null, validPixelPercent: null },
          },
          sceneCloudPercent: 12,
        },
        {
          acquiredAt: "2026-01-12T10:00:00Z",
          date: "2026-01-12",
          id: "future-observation",
          indicators: {
            ndmi: {
              median: 0.35,
              quality: {
                assessment: "sufficient",
                geometryPixelCount: 100,
                thresholdPercent: 70,
                validPixelCount: 90,
                rejectedPixelCounts: null,
              },
              validPixelPercent: 90,
            },
            ndvi: { median: null, quality: null, validPixelPercent: null },
          },
          sceneCloudPercent: 5,
        },
      ],
      provenance: {
        collection: "sentinel-2-l2a",
        license: "Contains modified Copernicus Sentinel data",
        provider: "Copernicus Data Space Ecosystem",
        retrievedAt: "2026-01-10T12:00:00Z",
        sourceUrl: "https://stac.dataspace.copernicus.eu/v1/search",
      },
      status: "complete",
    });
    const app = await createApp({ database, logger: false, satelliteHistoryProvider });

    const response = await app.inject({
      method: "POST",
      url: "/api/satellite-observations/summary",
      payload: { analysisDate: "2026-01-10", geometry },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      history: [{ date: "2026-01-08", ndmi: 0.27, validPixelPercent: 84 }],
      selectedObservation: { date: "2026-01-08" },
      status: "available",
      trend: { direction: "insufficient", observationCount: 1 },
    });
    expect(satelliteHistoryProvider.getObservationSeries).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("returns a safe service error when the CDSE catalogue fails", async () => {
    const satelliteHistoryProvider = provider();
    vi.mocked(satelliteHistoryProvider.getObservationSeries).mockRejectedValue(
      new SatelliteHistoryProviderError("REQUEST_FAILED"),
    );
    const app = await createApp({ database, logger: false, satelliteHistoryProvider });

    const response = await app.inject({
      method: "POST",
      url: "/api/satellite-observations/summary",
      payload: { analysisDate: "2026-01-10", geometry },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "SATELLITE_PROVIDER_UNAVAILABLE" },
    });
    await app.close();
  });

  it.each(["ndmi", "ndvi"] as const)(
    "reports the NDMI summary honestly when only %s is unavailable",
    async (failedIndicator) => {
      const satelliteHistoryProvider = provider();
      const statistics = {
        median: 0.27,
        quality: {
          assessment: "sufficient" as const,
          geometryPixelCount: 100,
          thresholdPercent: 70,
          validPixelCount: 84,
          rejectedPixelCounts: null,
        },
        validPixelPercent: 84,
      };
      const missing = { median: null, quality: null, validPixelPercent: null };
      vi.mocked(satelliteHistoryProvider.getObservationSeries).mockResolvedValue({
        limitations: [`${failedIndicator.toUpperCase()} parcel statistics are unavailable.`],
        observations: [
          {
            acquiredAt: "2026-01-08T10:00:00Z",
            date: "2026-01-08",
            id: "observation-1",
            indicators: {
              ndmi: failedIndicator === "ndmi" ? missing : statistics,
              ndvi: failedIndicator === "ndvi" ? missing : statistics,
            },
            sceneCloudPercent: 12,
          },
        ],
        provenance: {
          collection: "sentinel-2-l2a",
          license: "Contains modified Copernicus Sentinel data",
          provider: "Copernicus Data Space Ecosystem",
          retrievedAt: "2026-01-10T12:00:00Z",
          sourceUrl: "https://stac.dataspace.copernicus.eu/v1/search",
        },
        status: "partial",
      });
      const app = await createApp({ database, logger: false, satelliteHistoryProvider });
      try {
        const response = await app.inject({
          method: "POST",
          url: "/api/satellite-observations/summary",
          payload: { analysisDate: "2026-01-10", geometry },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject(
          failedIndicator === "ndmi"
            ? {
                status: "unavailable",
                reason: "statistics-unavailable",
                selectedObservation: null,
                history: [],
              }
            : { status: "available", reason: null, history: [{ date: "2026-01-08", ndmi: 0.27 }] },
        );
      } finally {
        await app.close();
      }
    },
  );

  it("rejects unknown fields", async () => {
    const app = await createApp({
      database,
      logger: false,
      satelliteHistoryProvider: provider(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/satellite-history/frame",
      payload: { date: "2025-06-10", geometry, layer: "ndmi", extra: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    await app.close();
  });
});
