import { describe, expect, it, vi } from "vitest";
import { SoilProfileProviderError } from "../../features/soil-profiles/soil-profile-provider.js";
import { createIsricSoilProfileProvider } from "./isric-soil-profile-provider.js";

const depths = [
  [0, 5],
  [5, 15],
  [15, 30],
  [30, 60],
  [60, 100],
  [100, 200],
] as const;

function createLayer(name: string, dFactor: number, baseValue: number) {
  return {
    name,
    unit_measure: {
      d_factor: dFactor,
      mapped_units: "provider units",
      target_units: "conventional units",
    },
    depths: depths.map(([topDepth, bottomDepth], index) => ({
      range: {
        top_depth: topDepth,
        bottom_depth: bottomDepth,
        unit_depth: "cm",
      },
      label: `${topDepth}-${bottomDepth}cm`,
      values: {
        "Q0.05": baseValue + index,
        "Q0.5": baseValue + index + 10,
        "Q0.95": baseValue + index + 20,
      },
    })),
  };
}

function createResponse(overrides: { sandFactor?: number } = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [21.55, 52.15] },
    properties: {
      layers: [
        createLayer("sand", overrides.sandFactor ?? 10, 500),
        createLayer("silt", 10, 200),
        createLayer("clay", 10, 100),
        createLayer("soc", 10, 40),
        createLayer("phh2o", 10, 35),
        createLayer("bdod", 100, 110),
        createLayer("wv0010", 10, 400),
        createLayer("wv0033", 10, 300),
        createLayer("wv1500", 10, 100),
      ],
    },
    query_time_s: 1.2,
  };
}

describe("ISRIC SoilGrids profile provider", () => {
  it("requests every property and quantile once and converts provider units", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(createResponse()));
    const provider = createIsricSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const profile = await provider.getProfile(21.55, 52.15);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("lon")).toBe("21.55");
    expect(requestUrl.searchParams.get("lat")).toBe("52.15");
    expect(requestUrl.searchParams.getAll("property")).toEqual([
      "sand",
      "silt",
      "clay",
      "soc",
      "phh2o",
      "bdod",
      "wv0010",
      "wv0033",
      "wv1500",
    ]);
    expect(requestUrl.searchParams.getAll("value")).toEqual(["Q0.05", "Q0.5", "Q0.95"]);
    expect(profile.layers).toHaveLength(6);
    expect(profile.layers[0]).toMatchObject({
      topDepthCm: 0,
      bottomDepthCm: 5,
      sandPercent: { q05: 50, q50: 51, q95: 52 },
      soilOrganicCarbonGramsPerKilogram: { q05: 4, q50: 5, q95: 6 },
      ph: { q05: 3.5, q50: 4.5, q95: 5.5 },
      bulkDensityKilogramsPerCubicDecimeter: { q05: 1.1, q50: 1.2, q95: 1.3 },
      waterContent10KpaPercent: { q05: 40, q50: 41, q95: 42 },
      waterContent33KpaPercent: { q05: 30, q50: 31, q95: 32 },
      waterContent1500KpaPercent: { q05: 10, q50: 11, q95: 12 },
    });
    expect(profile.retrievedAt).toBe("2026-11-21T12:00:00.000Z");
    expect(profile.sourceUrl).toBe("https://rest.isric.org/soilgrids/v2.0/properties/query");
  });

  it("rejects an unexpected provider conversion factor", async () => {
    const provider = createIsricSoilProfileProvider({
      fetch: vi.fn().mockResolvedValue(Response.json(createResponse({ sandFactor: 100 }))),
      logger: { warn: vi.fn() },
    });

    await expect(provider.getProfile(21.55, 52.15)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("returns explicit nulls when a property is absent", async () => {
    const response = createResponse();
    response.properties.layers = response.properties.layers.filter(({ name }) => name !== "silt");
    const provider = createIsricSoilProfileProvider({
      fetch: vi.fn().mockResolvedValue(Response.json(response)),
      logger: { warn: vi.fn() },
    });

    const profile = await provider.getProfile(21.55, 52.15);

    expect(profile.layers.every(({ siltPercent }) => siltPercent.q50 === null)).toBe(true);
  });

  it("logs a safe provider code when the request fails", async () => {
    const warn = vi.fn();
    const provider = createIsricSoilProfileProvider({
      fetch: vi.fn().mockRejectedValue(new Error("network details")),
      logger: { warn },
    });

    await expect(provider.getProfile(21.55, 52.15)).rejects.toBeInstanceOf(
      SoilProfileProviderError,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ISRIC SoilGrids",
        errorCode: "SOILGRIDS_REQUEST_FAILED",
      }),
      "Soil profile provider request failed",
    );
  });
});
