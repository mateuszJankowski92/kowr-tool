import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import { type LocatedParcel, type ParcelLocator, ParcelLocatorError } from "./parcel-locator.js";

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
        [21.6, 52.1],
        [21.6, 52.2],
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

function createLocator(result: LocatedParcel | null = parcel): ParcelLocator {
  return {
    findByIdentifier: vi.fn().mockResolvedValue(result),
    findByPoint: vi.fn().mockResolvedValue(result),
  };
}

describe("GET /api/parcels", () => {
  it.each([
    "",
    "unknown=value",
    "identifier=",
    "identifier=%20%20",
    `identifier=${"a".repeat(81)}`,
    "identifier=first&identifier=second",
    "identifier=test&unknown=value",
    "longitude=21.5",
    "longitude=&latitude=52.1",
    "longitude=21.5&latitude=",
    "longitude=%20&latitude=52.1",
    "longitude=abc&latitude=52.1",
    "longitude=0x15&latitude=52.1",
    "longitude=Infinity&latitude=52.1",
    "longitude=21.5&latitude=NaN",
    "longitude=181&latitude=52.1",
    "longitude=21.5&latitude=-91",
    "longitude=21.5&longitude=22&latitude=52.1",
    "longitude=21.5&latitude=52.1&latitude=52.1",
  ])("rejects invalid query input before calling a provider: %s", async (query) => {
    const locator = createLocator();
    const app = await createApp({ database, logger: false, parcelLocator: locator });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: `/api/parcels?${query}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "The request payload is invalid." },
    });
    expect(locator.findByPoint).not.toHaveBeenCalled();
    expect(locator.findByIdentifier).not.toHaveBeenCalled();
  });

  it("locates a parcel by point", async () => {
    const locator = createLocator();
    const app = await createApp({ database, logger: false, parcelLocator: locator });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/parcels?longitude=21.5&latitude=52.1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(parcel);
    expect(locator.findByPoint).toHaveBeenCalledWith(21.5, 52.1, undefined);
  });

  it("locates a parcel by identifier", async () => {
    const locator = createLocator();
    const app = await createApp({ database, logger: false, parcelLocator: locator });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/parcels?identifier=141201_1.0001.6509",
    });

    expect(response.statusCode).toBe(200);
    expect(locator.findByIdentifier).toHaveBeenCalledWith("141201_1.0001.6509", undefined);
  });

  it("rejects mixed lookup parameters", async () => {
    const app = await createApp({ database, logger: false, parcelLocator: createLocator() });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/parcels?identifier=test&longitude=21.5&latitude=52.1",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("returns an explicit not-found error", async () => {
    const app = await createApp({
      database,
      logger: false,
      parcelLocator: createLocator(null),
    });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/parcels?identifier=missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "PARCEL_NOT_FOUND",
        message: "No cadastral parcel was found for the supplied location or identifier.",
      },
    });
  });

  it("maps provider failures to a safe service-unavailable error", async () => {
    const locator = createLocator();
    vi.mocked(locator.findByIdentifier).mockRejectedValue(new ParcelLocatorError("TIMEOUT"));
    const app = await createApp({ database, logger: false, parcelLocator: locator });
    openApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/parcels?identifier=141201_1.0001.6509",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "PARCEL_PROVIDER_UNAVAILABLE",
        message: "The cadastral parcel service is temporarily unavailable. Please try again.",
      },
    });
  });
});
