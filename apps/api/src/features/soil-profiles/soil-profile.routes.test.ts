import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import {
  type SoilProfileLayer,
  type SoilProfileProvider,
  SoilProfileProviderError,
} from "./soil-profile-provider.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

function prediction(value: number) {
  return { q05: value - 1, q50: value, q95: value + 1 };
}

function layer(topDepthCm: number, bottomDepthCm: number): SoilProfileLayer {
  return {
    topDepthCm,
    bottomDepthCm,
    sandPercent: prediction(60),
    siltPercent: prediction(25),
    clayPercent: prediction(15),
    soilOrganicCarbonGramsPerKilogram: prediction(12),
    ph: prediction(6.2),
    bulkDensityKilogramsPerCubicDecimeter: prediction(1.4),
    waterContent10KpaPercent: prediction(40),
    waterContent33KpaPercent: prediction(30),
    waterContent1500KpaPercent: prediction(10),
  };
}

const completeLayers = [
  layer(0, 5),
  layer(5, 15),
  layer(15, 30),
  layer(30, 60),
  layer(60, 100),
  layer(100, 200),
] as const;

function createParcelLocator(degenerate = false): ParcelLocator {
  return {
    async findByIdentifier() {
      return {
        identifier: "141211_2.0038.102",
        parcelNumber: "102",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            degenerate
              ? [
                  [21.5, 52.1],
                  [21.6, 52.1],
                  [21.7, 52.1],
                  [21.5, 52.1],
                ]
              : [
                  [21.5, 52.1],
                  [21.6, 52.1],
                  [21.6, 52.2],
                  [21.5, 52.2],
                  [21.5, 52.1],
                ],
          ],
        },
        administrativeArea: {
          voivodeship: "mazowieckie",
          county: "powiat miński",
          commune: "Mińsk Mazowiecki",
          cadastralDistrict: "Tartak",
        },
        provenance: {
          provider: "GUGiK ULDK" as const,
          datasource: "powiat miński (wfs)",
          retrievedAt: "2026-11-21T11:00:00.000Z",
        },
      };
    },
    async findByPoint() {
      return null;
    },
  };
}

const soilProfileProvider: SoilProfileProvider = {
  async getProfile() {
    return {
      layers: [...completeLayers],
      retrievedAt: "2026-11-21T12:00:00.000Z",
      sourceUrl: "https://maps.isric.org/mapserv",
    };
  },
};

describe("GET /api/soil-profiles", () => {
  it("returns a complete profile for the representative interior point", async () => {
    const provider: SoilProfileProvider = {
      getProfile: vi.fn(soilProfileProvider.getProfile),
    };
    const app = await createApp({
      database,
      logger: false,
      parcelLocator: createParcelLocator(),
      soilProfileProvider: provider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/soil-profiles?parcelIdentifier=141211_2.0038.102",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      status: "complete",
      sample: {
        location: { type: "Point" },
        method: "representative-interior-point",
        spatialSupport: "single-soilgrids-cell",
      },
      provenance: {
        provider: "ISRIC",
        dataset: "SoilGrids250m 2.0",
        resolutionMeters: 250,
      },
    });
    expect(body.sample.location.coordinates[0]).toBeCloseTo(21.55);
    expect(body.sample.location.coordinates[1]).toBeCloseTo(52.15);
    expect(body.layers[0].availableWaterCapacity.using33Kpa).toEqual({
      volumetricPercent: 20,
      millimeters: 10,
    });
    expect(body.layers[0].availableWaterCapacity.using10Kpa).toEqual({
      volumetricPercent: 30,
      millimeters: 15,
    });

    const providerCall = vi.mocked(provider.getProfile).mock.calls[0];
    expect(providerCall?.[0]).toBeCloseTo(21.55);
    expect(providerCall?.[1]).toBeCloseTo(52.15);
  });

  it("returns a partial profile when one prediction is missing", async () => {
    const partialLayers = completeLayers.map((entry) => ({ ...entry })) as [
      SoilProfileLayer,
      SoilProfileLayer,
      SoilProfileLayer,
      SoilProfileLayer,
      SoilProfileLayer,
      SoilProfileLayer,
    ];
    partialLayers[0].sandPercent = { q05: null, q50: 60, q95: 61 };
    const app = await createApp({
      database,
      logger: false,
      parcelLocator: createParcelLocator(),
      soilProfileProvider: {
        async getProfile() {
          return {
            layers: partialLayers,
            retrievedAt: "2026-11-21T12:00:00.000Z",
            sourceUrl: "https://maps.isric.org/mapserv",
          };
        },
      },
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/soil-profiles?parcelIdentifier=141211_2.0038.102",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("partial");
  });

  it("maps provider failures to the public error shape", async () => {
    const app = await createApp({
      database,
      logger: false,
      parcelLocator: createParcelLocator(),
      soilProfileProvider: {
        async getProfile() {
          throw new SoilProfileProviderError("TIMEOUT");
        },
      },
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/soil-profiles?parcelIdentifier=141211_2.0038.102",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "SOIL_PROFILE_PROVIDER_UNAVAILABLE",
        message: "The soil profile service is temporarily unavailable. Please try again.",
      },
    });
  });

  it("rejects a parcel without an interior point", async () => {
    const app = await createApp({
      database,
      logger: false,
      parcelLocator: createParcelLocator(true),
      soilProfileProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/soil-profiles?parcelIdentifier=141211_2.0038.102",
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("SOIL_PROFILE_LOCATION_UNAVAILABLE");
  });
});
