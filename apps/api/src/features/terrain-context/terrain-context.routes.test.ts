import type { TerrainBounds } from "@kowr/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { LocatedParcel, ParcelLocator } from "../parcels/parcel-locator.js";
import type { SurroundingsProvider } from "./surroundings-provider.js";
import { projectWgs84Position } from "./terrain-geometry.js";
import {
  type TerrainProvider,
  TerrainProviderError,
  type TerrainTextureProvider,
} from "./terrain-provider.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

const parcel: LocatedParcel = {
  identifier: "141201_1.0001.6509",
  parcelNumber: "6509",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.5, 52.1],
        [21.501, 52.1],
        [21.501, 52.101],
        [21.5, 52.101],
        [21.5, 52.1],
      ],
    ],
  },
  administrativeArea: {
    voivodeship: "mazowieckie",
    county: "powiat miński",
    commune: "Mińsk Mazowiecki",
    cadastralDistrict: "Mińsk Mazowiecki",
  },
  provenance: {
    provider: "GUGiK ULDK",
    datasource: "powiat miński (wfs)",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
};

const parcelLocator: ParcelLocator = {
  findByIdentifier: vi.fn().mockResolvedValue(parcel),
  findByPoint: vi.fn().mockResolvedValue(parcel),
};

function elevations(bounds: TerrainBounds, columns: number, rows: number) {
  return {
    columns,
    rows,
    bounds,
    cellSizeMeters: (bounds.east - bounds.west) / columns,
    heightsMeters: Array.from({ length: columns * rows }, () => 112.4),
    retrievedAt: "2026-11-21T12:00:00.000Z",
  };
}

const terrainProvider: TerrainProvider = {
  getGrid: vi.fn((bounds, columns, rows) => Promise.resolve(elevations(bounds, columns, rows))),
};

const textureProvider: TerrainTextureProvider = {
  getTexture: vi.fn().mockResolvedValue({
    imageBase64: "YWJj",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  }),
};

const surroundingsProvider: SurroundingsProvider = {
  getFeatures: vi.fn().mockResolvedValue({
    searchRadiusMeters: 1_000,
    hydrologyFeatures: [],
    landUseFeatures: [],
    source: {
      snapshotAt: "2026-11-21T11:50:00.000Z",
      retrievedAt: "2026-11-21T12:00:00.000Z",
      sourceUrl: "https://www.openstreetmap.org/copyright",
    },
  }),
};

describe("terrain context routes", () => {
  it("returns calculated terrain with independently analysed surroundings", async () => {
    const app = await createApp({
      database,
      logger: false,
      parcelLocator,
      surroundingsProvider,
      terrainProvider,
      terrainTextureProvider: textureProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/terrain-contexts?parcelIdentifier=141201_1.0001.6509",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      terrain: {
        status: "available",
        metrics: {
          minimumElevationMeters: 112.4,
          maximumElevationMeters: 112.4,
          elevationRangeMeters: 0,
          dominantAspect: null,
        },
        source: { verticalReference: "PL-EVRF2007-NH" },
      },
      surroundings: {
        hydrology: { status: "available", objectCount: 0, nearestDistanceMeters: null },
        landUse: { status: "available", coveragePercent: 0, classes: [] },
      },
    });
  });

  it("returns source water geometry as WGS84 even when terrain is unavailable", async () => {
    const waterLine: [number, number][] = [
      [21.5, 52.1],
      [21.501, 52.101],
    ];
    const waterPolygon: [number, number][][] = [
      parcel.geometry.type === "Polygon" ? (parcel.geometry.coordinates[0] ?? []) : [],
    ];
    const app = await createApp({
      database,
      logger: false,
      parcelLocator,
      terrainProvider: {
        getGrid: vi.fn().mockRejectedValue(new TerrainProviderError("REQUEST_FAILED")),
      },
      terrainTextureProvider: textureProvider,
      surroundingsProvider: {
        getFeatures: vi.fn().mockResolvedValue({
          searchRadiusMeters: 1_000,
          hydrologyFeatures: [
            {
              id: "way/1",
              kind: "ditch",
              name: null,
              geometry: { type: "LineString", coordinates: waterLine.map(projectWgs84Position) },
            },
            {
              id: "way/2:0",
              kind: "pond",
              name: "Pond",
              geometry: {
                type: "Polygon",
                coordinates: waterPolygon.map((ring) => ring.map(projectWgs84Position)),
              },
            },
          ],
          landUseFeatures: [],
          source: {
            snapshotAt: "2026-11-21T11:50:00.000Z",
            retrievedAt: "2026-11-21T12:00:00.000Z",
            sourceUrl: "https://www.openstreetmap.org/copyright",
          },
        }),
      },
    });
    openApps.push(app);
    const response = await app.inject({
      method: "GET",
      url: `/api/terrain-contexts?parcelIdentifier=${parcel.identifier}`,
    });
    expect(response.statusCode).toBe(200);
    const hydrology = response.json().surroundings.hydrology;
    expect(hydrology.objectCount).toBe(2);
    const line = hydrology.objects.find((object: { id: string }) => object.id === "way/1");
    expect(line.geometry.type).toBe("LineString");
    expect(line.geometry.coordinates[0][0]).toBeCloseTo(21.5, 6);
    expect(line.geometry.coordinates[0][1]).toBeCloseTo(52.1, 6);
    const polygon = hydrology.objects.find((object: { id: string }) => object.id === "way/2:0");
    expect(polygon.geometry.type).toBe("Polygon");
    expect(polygon.geometry.coordinates[0][2][0]).toBeCloseTo(21.501, 6);
    expect(polygon.geometry.coordinates[0][2][1]).toBeCloseTo(52.101, 6);
  });

  it("returns a georeferenced orthophoto data URL", async () => {
    const app = await createApp({
      database,
      logger: false,
      parcelLocator,
      surroundingsProvider,
      terrainProvider,
      terrainTextureProvider: textureProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/terrain-textures?parcelIdentifier=141201_1.0001.6509",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      imageDataUrl: "data:image/jpeg;base64,YWJj",
      source: { dataset: "Ortofotomapa standardowa" },
    });
  });

  it("keeps surroundings when the independent terrain source fails", async () => {
    const unavailableTerrainProvider: TerrainProvider = {
      getGrid: vi.fn().mockRejectedValue(new TerrainProviderError("REQUEST_FAILED")),
    };
    const app = await createApp({
      database,
      logger: false,
      parcelLocator,
      surroundingsProvider,
      terrainProvider: unavailableTerrainProvider,
      terrainTextureProvider: textureProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/terrain-contexts?parcelIdentifier=141201_1.0001.6509",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "partial",
      terrain: { status: "unavailable", reason: "provider-error" },
      surroundings: {
        hydrology: { status: "available" },
        landUse: { status: "available" },
      },
    });
  });

  it("keeps terrain when the independent surroundings source fails", async () => {
    const unavailableSurroundingsProvider: SurroundingsProvider = {
      getFeatures: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const app = await createApp({
      database,
      logger: false,
      parcelLocator,
      surroundingsProvider: unavailableSurroundingsProvider,
      terrainProvider,
      terrainTextureProvider: textureProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/terrain-contexts?parcelIdentifier=141201_1.0001.6509",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "partial",
      terrain: { status: "available" },
      surroundings: {
        hydrology: { status: "unavailable", reason: "provider-error" },
        landUse: { status: "unavailable", reason: "provider-error" },
      },
    });
  });
});
