import { describe, expect, it, vi } from "vitest";
import { ParcelLocatorError } from "../../features/parcels/parcel-locator.js";
import { createUldkParcelLocator } from "./uldk-parcel-locator.js";

const POLYGON_RESPONSE = `0
141201_1.0001.6509|6509|mazowieckie|powiat miński|Mińsk Mazowiecki (miasto)|Mińsk Mazowiecki|powiat miński (wfs)|SRID=4326;POLYGON((21.5 52.1,21.6 52.1,21.6 52.2,21.5 52.1))`;

function createLogger() {
  return { warn: vi.fn() };
}

describe("GUGiK ULDK parcel locator", () => {
  it("maps a parcel response to the application model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(POLYGON_RESPONSE));
    const locator = createUldkParcelLocator({
      fetch: fetchMock,
      logger: createLogger(),
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const parcel = await locator.findByIdentifier("141201_1.0001.6509");

    expect(parcel).toEqual({
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
        commune: "Mińsk Mazowiecki (miasto)",
        cadastralDistrict: "Mińsk Mazowiecki",
      },
      provenance: {
        provider: "GUGiK ULDK",
        datasource: "powiat miński (wfs)",
        retrievedAt: "2026-11-21T12:00:00.000Z",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("request=GetParcelById"),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": "KOWR-Water-Assistant/0.1" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns null when ULDK reports no result", async () => {
    const locator = createUldkParcelLocator({
      fetch: vi.fn().mockResolvedValue(new Response("-1 brak wyników")),
      logger: createLogger(),
    });

    await expect(locator.findByPoint(21.5, 52.1)).resolves.toBeNull();
  });

  it("rejects a redirect instead of following an untrusted or parameter-losing target", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    const locator = createUldkParcelLocator({ fetch: fetchMock, logger: createLogger() });

    await expect(locator.findByIdentifier("141201_1.0001.6509")).rejects.toBeInstanceOf(
      ParcelLocatorError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^https:\/\//);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects malformed provider geometry without exposing its payload", async () => {
    const logger = createLogger();
    const locator = createUldkParcelLocator({
      fetch: vi.fn().mockResolvedValue(new Response("0\nid|1||||||POLYGON(invalid)")),
      logger,
    });

    await expect(locator.findByIdentifier("id")).rejects.toBeInstanceOf(ParcelLocatorError);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "GUGiK ULDK",
        errorCode: "ULDK_INVALID_RESPONSE",
      }),
      "Parcel provider request failed",
    );
  });
});
