import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SoilProfilePropertyCache } from "../../features/soil-profiles/soil-profile-property-cache.js";
import { SoilProfileProviderError } from "../../features/soil-profiles/soil-profile-provider.js";
import { createIsricWmsSoilProfileProvider } from "./isric-wms-soil-profile-provider.js";

const propertySettings = {
  sand: { base: 500, unit: "g/kg" },
  silt: { base: 200, unit: "g/kg" },
  clay: { base: 100, unit: "g/kg" },
  soc: { base: 40, unit: "dg/kg" },
  phh2o: { base: 35, unit: "pH*10" },
  bdod: { base: 110, unit: "cg/cm3" },
  wv0010: { base: 400, unit: "g/kg" },
  wv0033: { base: 300, unit: "g/kg" },
  wv1500: { base: 100, unit: "g/kg" },
} as const;

const rasterReadError = readFileSync(
  new URL("./fixtures/wms-raster-read-error.xml", import.meta.url),
  "utf8",
);
const waterMedian = JSON.parse(
  readFileSync(new URL("./fixtures/wms-water-median.geojson", import.meta.url), "utf8"),
) as {
  features: [{ id: string; properties: { pixel_value: number; unit: string } }];
};

type PropertyId = keyof typeof propertySettings;

function createFeatureInfo(property: PropertyId): string {
  const { base, unit } = propertySettings[property];
  return Array.from({ length: 18 }, (_, index) => {
    const depthIndex = Math.floor(index / 3);
    const quantileIndex = index % 3;
    const providerOrder = depthIndex % 2 === 0 ? [0, 10, 20] : [10, 0, 20];
    return JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: `${property}_provider-id`,
          properties: {
            pixel_value: base + depthIndex + (providerOrder[quantileIndex] ?? 0),
            unit,
          },
        },
      ],
    });
  }).join("\n\n");
}

function propertyFromRequest(input: Parameters<typeof fetch>[0]): PropertyId {
  const url = new URL(String(input));
  const property = url.pathname.split("/").at(-1);
  if (!property || !(property in propertySettings)) throw new Error("Unexpected property");
  return property as PropertyId;
}

function singleLayerResponse(input: Parameters<typeof fetch>[0]): Response {
  const property = propertyFromRequest(input);
  const layer = new URL(String(input)).searchParams.get("QUERY_LAYERS") ?? "";
  const match = /_(\d+)-(\d+)cm_(Q0\.05|Q0\.5|Q0\.95)$/.exec(layer);
  if (!match) throw new Error("Expected one explicitly named raster");
  const topDepths = [0, 5, 15, 30, 60, 100];
  const depthIndex = topDepths.indexOf(Number(match[1]));
  const offset = { "Q0.05": 0, "Q0.5": 10, "Q0.95": 20 }[match[3] ?? ""] ?? 0;
  const payload = structuredClone(waterMedian);
  payload.features[0].id = layer;
  payload.features[0].properties = {
    pixel_value: propertySettings[property].base + depthIndex + offset,
    unit: propertySettings[property].unit,
  };
  return Response.json(payload);
}

function getWaterProfile(
  provider: ReturnType<typeof createIsricWmsSoilProfileProvider>,
  signal?: AbortSignal,
) {
  if (!provider.getWaterProfile) throw new Error("Water profile operation is unavailable");
  return provider.getWaterProfile(21.55, 52.15, signal);
}

describe("ISRIC SoilGrids WMS profile provider", () => {
  it("fetches nine properties concurrently and maps all depths and quantiles", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const property = propertyFromRequest(input);
      return new Response(createFeatureInfo(property));
    });
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const profile = await provider.getProfile(21.55, 52.15);

    expect(fetchMock).toHaveBeenCalledTimes(9);
    for (const [input] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toBe(`/mapserv/${propertyFromRequest(input)}`);
      expect(url.searchParams.has("map")).toBe(false);
      expect(url.searchParams.get("REQUEST")).toBe("GetFeatureInfo");
      expect(url.searchParams.get("QUERY_LAYERS")?.split(",")).toHaveLength(18);
      expect(url.searchParams.get("INFO_FORMAT")).toBe("application/geo+json");
    }
    expect(profile.layers[0]).toMatchObject({
      sandPercent: { q05: 50, q50: 51, q95: 52 },
      soilOrganicCarbonGramsPerKilogram: { q05: 4, q50: 5, q95: 6 },
      ph: { q05: 3.5, q50: 4.5, q95: 5.5 },
      bulkDensityKilogramsPerCubicDecimeter: { q05: 1.1, q50: 1.2, q95: 1.3 },
      waterContent10KpaPercent: { q05: 40, q50: 41, q95: 42 },
      waterContent33KpaPercent: { q05: 30, q50: 31, q95: 32 },
      waterContent1500KpaPercent: { q05: 10, q50: 11, q95: 12 },
    });
    expect(profile.sourceUrl).toBe("https://maps.isric.org/mapserv");
  });

  it("returns nulls for one failed property and preserves the others", async () => {
    const warn = vi.fn();
    const provider = createIsricWmsSoilProfileProvider({
      fetch: vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const property = propertyFromRequest(input);
        if (property === "silt") throw new Error("network details");
        return new Response(createFeatureInfo(property));
      }),
      logger: { warn },
    });

    const profile = await provider.getProfile(21.55, 52.15);

    expect(profile.layers.every((layer) => layer.siltPercent.q50 === null)).toBe(true);
    expect(profile.layers.every((layer) => layer.sandPercent.q50 !== null)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ISRIC SoilGrids WMS",
        property: "silt",
        errorCode: "SOILGRIDS_WMS_REQUEST_FAILED",
      }),
      "Soil profile property request failed",
    );
  });

  it("fetches only the three water-retention properties for the FAO-56 balance", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const property = propertyFromRequest(input);
      return new Response(createFeatureInfo(property));
    });
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });

    const profile = await getWaterProfile(provider);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => propertyFromRequest(input)).toSorted()).toEqual([
      "wv0010",
      "wv0033",
      "wv1500",
    ]);
    expect(profile.layers[0]).toMatchObject({
      sandPercent: { q05: null, q50: null, q95: null },
      waterContent10KpaPercent: { q05: 40, q50: 41, q95: 42 },
      waterContent33KpaPercent: { q05: 30, q50: 31, q95: 32 },
      waterContent1500KpaPercent: { q05: 10, q50: 11, q95: 12 },
    });
  });

  it("retries a transient 429 once without retrying successful properties", async () => {
    const attempts = new Map<PropertyId, number>();
    const warn = vi.fn();
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const property = propertyFromRequest(input);
      const attempt = (attempts.get(property) ?? 0) + 1;
      attempts.set(property, attempt);
      if (property === "wv0033" && attempt === 1) return new Response(null, { status: 429 });
      return new Response(createFeatureInfo(property));
    });
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn },
    });

    await expect(getWaterProfile(provider)).resolves.toBeDefined();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        property: "wv0033",
        attempt: 1,
        errorCode: "SOILGRIDS_WMS_REQUEST_FAILED",
        willRetry: true,
      }),
      "Soil profile property request failed",
    );
  });

  it("coalesces concurrent water-profile calls and reuses successful cached properties", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const property = propertyFromRequest(input);
      return new Response(createFeatureInfo(property));
    });
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });

    await Promise.all([getWaterProfile(provider), getWaterProfile(provider)]);
    await getWaterProfile(provider);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reuses a persistent source-data cache when SoilGrids is unavailable", async () => {
    const values = { wv0010: 40, wv0033: 30, wv1500: 10 } as const;
    const persistentCache: SoilProfilePropertyCache = {
      async find(key) {
        const value = values[key.property as keyof typeof values];
        if (value === undefined) return null;
        return {
          ...key,
          longitude: 21.55,
          latitude: 52.15,
          predictions: Array.from({ length: 6 }, () => ({
            q05: value,
            q50: value + 1,
            q95: value + 2,
          })),
          product: "SoilGrids250m",
          productVersion: "2.0",
          resolutionMeters: 250,
          unit: "10^-2 cm3/cm3 (volumetric percent)",
          sourceUrl: "https://maps.isric.org/mapserv",
          retrievedAt: "2026-11-20T10:00:00.000Z",
        };
      },
      store: vi.fn(),
    };
    const fetchMock = vi.fn().mockRejectedValue(new Error("service unavailable"));
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
      persistentCache,
    });

    const profile = await getWaterProfile(provider);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(profile.retrievedAt).toBe("2026-11-20T10:00:00.000Z");
    expect(profile.layers[0]).toMatchObject({
      waterContent10KpaPercent: { q50: 41 },
      waterContent33KpaPercent: { q50: 31 },
      waterContent1500KpaPercent: { q50: 11 },
    });
  });

  it("propagates caller cancellation and does not retry an abandoned request", async () => {
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });
    const controller = new AbortController();
    const request = getWaterProfile(provider, controller.signal);

    controller.abort(new DOMException("Cancelled", "AbortError"));

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails when every property request fails", async () => {
    const provider = createIsricWmsSoilProfileProvider({
      fetch: vi.fn().mockRejectedValue(new Error("service unavailable")),
      logger: { warn: vi.fn() },
    });

    await expect(provider.getProfile(21.55, 52.15)).rejects.toBeInstanceOf(
      SoilProfileProviderError,
    );
  });

  it("rejects an incomplete multi-layer response", async () => {
    const provider = createIsricWmsSoilProfileProvider({
      fetch: vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const property = propertyFromRequest(input);
        return new Response(createFeatureInfo(property).split("\n\n")[0]);
      }),
      logger: { warn: vi.fn() },
    });

    await expect(provider.getProfile(21.55, 52.15)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("retries an empty response and does not retain the failure in the property cache", async () => {
    const attempts = new Map<PropertyId, number>();
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const property = propertyFromRequest(input);
      const attempt = (attempts.get(property) ?? 0) + 1;
      attempts.set(property, attempt);
      if (property === "wv0033" && attempt <= 2) return new Response("\n\n");
      return new Response(createFeatureInfo(property));
    });
    const provider = createIsricWmsSoilProfileProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });

    const partialProfile = await getWaterProfile(provider);
    const completeProfile = await getWaterProfile(provider);

    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(
      partialProfile.layers.every((layer) => layer.waterContent33KpaPercent.q50 === null),
    ).toBe(true);
    expect(
      completeProfile.layers.every((layer) => layer.waterContent33KpaPercent.q50 !== null),
    ).toBe(true);
  });
  it("isolates a corrupt uncertainty raster while preserving all water medians", async () => {
    const warn = vi.fn();
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const layers = new URL(String(input)).searchParams.get("QUERY_LAYERS") ?? "";
      if (layers.includes(",")) return new Response(rasterReadError);
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return layers === "wv0033_100-200cm_Q0.05"
        ? new Response(rasterReadError)
        : singleLayerResponse(input);
    });
    const provider = createIsricWmsSoilProfileProvider({ fetch: fetchMock, logger: { warn } });
    const profile = await getWaterProfile(provider);
    expect(
      profile.layers.every((layer) =>
        [
          layer.waterContent10KpaPercent.q50,
          layer.waterContent33KpaPercent.q50,
          layer.waterContent1500KpaPercent.q50,
        ].every((value) => value !== null),
      ),
    ).toBe(true);
    expect(profile.layers[5].waterContent33KpaPercent).toEqual({ q05: null, q50: 31.5, q95: 32.5 });
    expect(peak).toBeLessThanOrEqual(6);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        property: "wv0033",
        errorCode: "SOILGRIDS_WMS_LAYER_RECOVERY",
        recoveredValueCount: 17,
      }),
      expect.any(String),
    );
  });

  it("reuses fully recovered source values and retries incomplete recovered properties", async () => {
    let broken = true;
    const requests: string[] = [];
    const provider = createIsricWmsSoilProfileProvider({
      logger: { warn: vi.fn() },
      fetch: vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const layers = new URL(String(input)).searchParams.get("QUERY_LAYERS") ?? "";
        requests.push(layers);
        if (layers.includes(",") || (broken && layers === "wv0033_100-200cm_Q0.05"))
          return new Response(rasterReadError);
        return singleLayerResponse(input);
      }),
    });
    await getWaterProfile(provider);
    requests.length = 0;
    broken = false;
    const recovered = await getWaterProfile(provider);
    expect(requests.every((layer) => layer.startsWith("wv0033_"))).toBe(true);
    expect(recovered.layers[5].waterContent33KpaPercent.q05).toBe(30.5);
    requests.length = 0;
    await getWaterProfile(provider);
    expect(requests).toHaveLength(0);
  });

  it("propagates cancellation during layer recovery instead of returning a partial profile", async () => {
    const controller = new AbortController();
    const provider = createIsricWmsSoilProfileProvider({
      logger: { warn: vi.fn() },
      fetch: vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const layers = new URL(String(input)).searchParams.get("QUERY_LAYERS") ?? "";
        if (layers.includes(",")) return new Response(rasterReadError);
        controller.abort(new DOMException("Cancelled", "AbortError"));
        return singleLayerResponse(input);
      }),
    });
    await expect(getWaterProfile(provider, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
