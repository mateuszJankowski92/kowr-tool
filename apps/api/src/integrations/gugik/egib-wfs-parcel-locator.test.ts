import { describe, expect, it, vi } from "vitest";
import type { LocatedParcel, ParcelLocator } from "../../features/parcels/parcel-locator.js";
import { ParcelLocatorError } from "../../features/parcels/parcel-locator.js";
import { createEgibWfsParcelLocator } from "./egib-wfs-parcel-locator.js";
import { createGugikParcelLocator } from "./gugik-parcel-locator.js";

const FEATURE = {
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.58, 52.17],
        [21.6, 52.17],
        [21.6, 52.18],
        [21.58, 52.18],
        [21.58, 52.17],
      ],
    ],
  },
  properties: {
    ID_DZIALKI: "141201_1.0001.6509",
    NUMER_DZIALKI: "6509",
    NAZWA_OBREBU: "MIŃSK MAZOWIECKI",
    NAZWA_GMINY: "Mińsk Mazowiecki",
    DATA: "2026-11-20",
  },
};

function jsonResponse(features: unknown[]): Response {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), {
    headers: { "Content-Type": "application/json" },
  });
}

function createLogger() {
  return { warn: vi.fn() };
}

describe("GUGiK aggregated EGiB WFS parcel locator", () => {
  it("maps an exact identifier result and records the fallback provenance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([FEATURE]));
    const locator = createEgibWfsParcelLocator({
      fetch: fetchMock,
      logger: createLogger(),
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const parcel = await locator.findByIdentifier(" 141201_1.0001.6509 ");

    expect(parcel).toEqual({
      identifier: "141201_1.0001.6509",
      parcelNumber: "6509",
      geometry: FEATURE.geometry,
      administrativeArea: {
        voivodeship: null,
        county: null,
        commune: "Mińsk Mazowiecki",
        cadastralDistrict: "MIŃSK MAZOWIECKI",
      },
      provenance: {
        provider: "GUGiK EGiB WFS",
        datasource: "Aggregated EGiB WFS snapshot 2026-11-20",
        retrievedAt: "2026-11-21T12:00:00.000Z",
      },
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(
      "https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza",
    );
    expect(url.searchParams.get("FILTER")).toContain(
      "<fes:Literal>141201_1.0001.6509</fes:Literal>",
    );
    expect(url.searchParams.get("COUNT")).toBe("2");
  });

  it("uses WFS axis order for a point and validates that the result contains it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([FEATURE]));
    const locator = createEgibWfsParcelLocator({ fetch: fetchMock, logger: createLogger() });

    await expect(locator.findByPoint(21.59, 52.175)).resolves.toMatchObject({
      identifier: "141201_1.0001.6509",
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("FILTER")).toContain("<gml:pos>52.175 21.59</gml:pos>");
  });

  it("rejects a parcel that does not match the requested identifier", async () => {
    const locator = createEgibWfsParcelLocator({
      fetch: vi.fn().mockResolvedValue(jsonResponse([FEATURE])),
      logger: createLogger(),
    });

    await expect(locator.findByIdentifier("141201_1.0001.9999")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("returns null for a valid empty feature collection", async () => {
    const locator = createEgibWfsParcelLocator({
      fetch: vi.fn().mockResolvedValue(jsonResponse([])),
      logger: createLogger(),
    });

    await expect(locator.findByIdentifier("141201_1.0001.6509")).resolves.toBeNull();
  });

  it("rejects oversized or non-JSON responses before parsing them", async () => {
    const locator = createEgibWfsParcelLocator({
      fetch: vi.fn().mockResolvedValue(
        new Response("not json", {
          headers: {
            "Content-Type": "text/html",
            "Content-Length": "4294967296",
          },
        }),
      ),
      logger: createLogger(),
    });

    await expect(locator.findByIdentifier("141201_1.0001.6509")).rejects.toBeInstanceOf(
      ParcelLocatorError,
    );
  });
});

function createParcel(): LocatedParcel {
  return {
    identifier: "141201_1.0001.6509",
    parcelNumber: "6509",
    geometry: FEATURE.geometry as LocatedParcel["geometry"],
    administrativeArea: {
      voivodeship: null,
      county: null,
      commune: "Mińsk Mazowiecki",
      cadastralDistrict: "MIŃSK MAZOWIECKI",
    },
    provenance: {
      provider: "GUGiK EGiB WFS",
      datasource: "Aggregated EGiB WFS",
      retrievedAt: "2026-11-21T12:00:00.000Z",
    },
  };
}

describe("GUGiK parcel locator fallback", () => {
  it("uses EGiB WFS after a technical ULDK failure", async () => {
    const primary: ParcelLocator = {
      findByIdentifier: vi.fn().mockRejectedValue(new ParcelLocatorError("REQUEST_FAILED")),
      findByPoint: vi.fn().mockRejectedValue(new ParcelLocatorError("REQUEST_FAILED")),
    };
    const fallback: ParcelLocator = {
      findByIdentifier: vi.fn().mockResolvedValue(createParcel()),
      findByPoint: vi.fn().mockResolvedValue(createParcel()),
    };
    const locator = createGugikParcelLocator(primary, fallback);

    await expect(locator.findByIdentifier("141201_1.0001.6509")).resolves.toMatchObject({
      provenance: { provider: "GUGiK EGiB WFS" },
    });
    expect(fallback.findByIdentifier).toHaveBeenCalledOnce();
  });

  it("does not query the fallback when ULDK returns a valid no-result response", async () => {
    const primary: ParcelLocator = {
      findByIdentifier: vi.fn().mockResolvedValue(null),
      findByPoint: vi.fn().mockResolvedValue(null),
    };
    const fallback: ParcelLocator = {
      findByIdentifier: vi.fn().mockResolvedValue(createParcel()),
      findByPoint: vi.fn().mockResolvedValue(createParcel()),
    };
    const locator = createGugikParcelLocator(primary, fallback);

    await expect(locator.findByIdentifier("missing")).resolves.toBeNull();
    expect(fallback.findByIdentifier).not.toHaveBeenCalled();
  });
});
