import { afterEach, describe, expect, it, vi } from "vitest";
import { getParcel } from "./parcels";

const parcelResponse = {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getParcel", () => {
  it("encodes a coordinate lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(parcelResponse));
    vi.stubGlobal("fetch", fetchMock);

    await getParcel({ type: "point", longitude: 21.5, latitude: 52.1 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/parcels?longitude=21.5&latitude=52.1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("encodes an identifier lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(parcelResponse));
    vi.stubGlobal("fetch", fetchMock);

    await getParcel({ type: "identifier", identifier: "141201_1.0001.6509" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/parcels?identifier=141201_1.0001.6509",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
