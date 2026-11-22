import type { ParcelGeometry } from "@kowr/contracts";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createCdseSatelliteProvider } from "./cdse-satellite-provider.js";

const geometry: ParcelGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [17.29, 52.19],
      [17.31, 52.19],
      [17.31, 52.21],
      [17.29, 52.19],
    ],
  ],
};

function logger(): Pick<FastifyBaseLogger, "warn"> {
  return { warn: vi.fn() };
}

const catalogueResponse = {
  features: [
    {
      id: "cloudier-reprocessing",
      properties: { datetime: "2025-06-10T10:05:00Z", "eo:cloud_cover": 30 },
    },
    {
      id: "selected-observation",
      properties: { datetime: "2025-06-10T10:06:00Z", "eo:cloud_cover": 0 },
    },
    {
      id: "second-observation",
      properties: { datetime: "2025-06-15T10:05:00Z" },
    },
  ],
};

function statisticsResponse(median: number | "NaN", noDataCount = 20) {
  return {
    geometryPixelCount: 100,
    data: [
      {
        interval: { from: "2025-06-10T00:00:00Z", to: "2025-06-11T00:00:00Z" },
        outputs: {
          index: {
            bands: {
              B0: {
                stats: {
                  min: median,
                  max: median,
                  mean: median,
                  stDev: 0,
                  sampleCount: 100,
                  noDataCount,
                  percentiles: { "50.0": median },
                },
              },
            },
          },
        },
      },
    ],
  };
}

describe("CDSE satellite provider", () => {
  it("loads the catalogue once and calculates NDMI and NDVI in parallel for the summary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogueResponse)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token", expires_in: 600 })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(statisticsResponse(0.22))))
      .mockResolvedValueOnce(new Response(JSON.stringify(statisticsResponse(0.64))));
    const provider = createCdseSatelliteProvider({
      clientId: "client",
      clientSecret: "secret",
      fetch: fetchMock,
      logger: logger(),
      now: () => new Date("2026-11-21T12:00:00Z"),
    });

    const result = await provider.getObservationSeries(geometry, "2025-05-01", "2025-06-20");

    expect(result.status).toBe("complete");
    expect(result.observations[0]).toMatchObject({
      date: "2025-06-10",
      indicators: {
        ndmi: { median: 0.22, validPixelPercent: 80 },
        ndvi: { median: 0.64, validPixelPercent: 80 },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const catalogueRequests = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "https://stac.dataspace.copernicus.eu/v1/search",
    );
    expect(catalogueRequests).toHaveLength(1);
  });

  it("keeps public dates but marks summary statistics unavailable without credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(catalogueResponse), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = createCdseSatelliteProvider({
      fetch: fetchMock,
      logger: logger(),
      now: () => new Date("2026-11-21T12:00:00Z"),
    });

    const result = await provider.getObservationSeries(geometry, "2025-05-01", "2025-06-20");

    expect(result.status).toBe("partial");
    expect(result.observations[0]?.indicators).toEqual({
      ndmi: { median: null, quality: null, validPixelPercent: null },
      ndvi: { median: null, quality: null, validPixelPercent: null },
    });
    expect(result.limitations[0]).toContain("credentials are not configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["ndmi", "ndvi"] as const)(
    "preserves the other indicator when %s statistics fail",
    async (failedIndicator) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(catalogueResponse)))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "token", expires_in: 600 })),
        )
        .mockResolvedValueOnce(
          failedIndicator === "ndmi"
            ? new Response("unavailable", { status: 503 })
            : new Response(JSON.stringify(statisticsResponse(0.22))),
        )
        .mockResolvedValueOnce(
          failedIndicator === "ndvi"
            ? new Response("unavailable", { status: 503 })
            : new Response(JSON.stringify(statisticsResponse(0.64))),
        );
      const log = logger();
      const provider = createCdseSatelliteProvider({
        clientId: "client",
        clientSecret: "secret",
        fetch: fetchMock,
        logger: log,
      });

      const result = await provider.getObservationSeries(geometry, "2025-05-01", "2025-06-20");
      const availableIndicator = failedIndicator === "ndmi" ? "ndvi" : "ndmi";

      expect(result.status).toBe("partial");
      expect(result.limitations).toContain(
        `${failedIndicator.toUpperCase()} parcel statistics are unavailable.`,
      );
      expect(result.observations[0]?.indicators[failedIndicator].median).toBeNull();
      expect(result.observations[0]?.indicators[availableIndicator]).toMatchObject({
        median: availableIndicator === "ndmi" ? 0.22 : 0.64,
        validPixelPercent: 80,
        quality: { assessment: "sufficient" },
      });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ indicator: failedIndicator, errorCode: expect.any(String) }),
        expect.any(String),
      );
    },
  );

  it("returns public dates as a partial result when credentials are absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(catalogueResponse), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = createCdseSatelliteProvider({
      fetch: fetchMock,
      logger: logger(),
      now: () => new Date("2026-11-21T12:00:00Z"),
    });

    const result = await provider.getHistory(geometry, 2025, "2026-11-21", "ndmi");

    expect(result.status).toBe("partial");
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]).toMatchObject({
      id: "selected-observation",
      date: "2025-06-10",
      sceneCloudPercent: 0,
      median: null,
      validPixelPercent: null,
    });
    expect(result.observations[1]?.sceneCloudPercent).toBeNull();
    expect(result.limitations[0]).toContain("credentials are not configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("combines daily parcel statistics with catalogue observations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogueResponse)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token", expires_in: 600 })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            geometryPixelCount: 1000,
            data: [
              {
                interval: { from: "2025-06-10T00:00:00Z", to: "2025-06-11T00:00:00Z" },
                outputs: {
                  index: {
                    bands: {
                      B0: {
                        stats: {
                          min: 0.1,
                          max: 0.5,
                          mean: 0.3,
                          stDev: 0.1,
                          sampleCount: 1600,
                          noDataCount: 1293,
                          percentiles: { "50.0": 0.34 },
                        },
                      },
                    },
                  },
                  scl: {
                    bands: {
                      B0: {
                        stats: {
                          min: 3,
                          max: 11,
                          mean: 7,
                          stDev: 2,
                          sampleCount: 1600,
                          noDataCount: 600,
                        },
                        histogram: {
                          bins: [
                            { lowEdge: 0, highEdge: 1, count: 0 },
                            { lowEdge: 1, highEdge: 2, count: 0 },
                            { lowEdge: 2, highEdge: 3, count: 0 },
                            { lowEdge: 3, highEdge: 4, count: 100 },
                            { lowEdge: 4, highEdge: 5, count: 200 },
                            { lowEdge: 5, highEdge: 6, count: 107 },
                            { lowEdge: 6, highEdge: 7, count: 50 },
                            { lowEdge: 7, highEdge: 8, count: 43 },
                            { lowEdge: 8, highEdge: 9, count: 300 },
                            { lowEdge: 9, highEdge: 10, count: 100 },
                            { lowEdge: 10, highEdge: 11, count: 50 },
                            { lowEdge: 11, highEdge: 12, count: 50 },
                          ],
                        },
                      },
                    },
                  },
                },
              },
              {
                interval: { from: "2025-06-15T00:00:00Z", to: "2025-06-16T00:00:00Z" },
                outputs: {
                  index: {
                    bands: {
                      B0: {
                        stats: {
                          min: "NaN",
                          max: "NaN",
                          mean: "NaN",
                          stDev: "NaN",
                          sampleCount: 100,
                          noDataCount: 100,
                          percentiles: { "50.0": "NaN" },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
        ),
      );
    const provider = createCdseSatelliteProvider({
      clientId: "client",
      clientSecret: "secret",
      fetch: fetchMock,
      logger: logger(),
      now: () => new Date("2026-11-21T12:00:00Z"),
    });

    const result = await provider.getHistory(geometry, 2025, "2026-11-21", "ndmi");
    const statisticsRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as unknown;

    expect(result.status).toBe("complete");
    expect(result.observations[0]).toMatchObject({
      median: 0.34,
      sceneCloudPercent: 0,
      validPixelPercent: 30.7,
      quality: {
        assessment: "limited",
        geometryPixelCount: 1000,
        thresholdPercent: 70,
        validPixelCount: 307,
        rejectedPixelCounts: {
          cloud: 450,
          cloudShadow: 100,
          noData: 0,
          other: 93,
          snow: 50,
        },
      },
    });
    expect(result.provenance.sourceUrl).toContain("stac.dataspace.copernicus.eu");
    expect(statisticsRequest).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          bounds: expect.objectContaining({
            properties: {
              crs: "http://www.opengis.net/def/crs/EPSG/0/32633",
            },
          }),
        }),
      }),
    );
  });

  it("renders a PNG frame without exposing the OAuth secret", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token", expires_in: 600 })),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        }),
      );
    const provider = createCdseSatelliteProvider({
      clientId: "client",
      clientSecret: "do-not-expose",
      fetch: fetchMock,
      logger: logger(),
      now: () => new Date("2026-11-21T12:00:00Z"),
    });

    const result = await provider.getFrame(geometry, "2025-06-10", "true-color");

    expect(result.imageBase64).toBe("iVBORw==");
    expect(result.bounds).toEqual([17.29, 52.19, 17.31, 52.21]);
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('\\"SCL\\"');
    expect(JSON.stringify(result)).not.toContain("do-not-expose");
  });
});
