import type { ParcelGeometry } from "@kowr/contracts";
import { describe, expect, it, vi } from "vitest";
import { createOpenStreetMapSurroundingsProvider } from "./openstreetmap-surroundings-provider.js";

const parcelGeometry: ParcelGeometry = {
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
};

const responsePayload = {
  osm3s: { timestamp_osm_base: "2026-11-21T11:55:00Z" },
  elements: [
    {
      type: "way",
      id: 10,
      tags: { waterway: "stream", name: "Struga" },
      geometry: [
        { lat: 52.1, lon: 21.499 },
        { lat: 52.101, lon: 21.499 },
      ],
    },
    {
      type: "way",
      id: 11,
      tags: { landuse: "farmland" },
      geometry: [
        { lat: 52.1, lon: 21.5 },
        { lat: 52.1, lon: 21.501 },
        { lat: 52.101, lon: 21.501 },
        { lat: 52.101, lon: 21.5 },
        { lat: 52.1, lon: 21.5 },
      ],
    },
    {
      type: "relation",
      id: 12,
      tags: { natural: "water", water: "pond" },
      members: [
        {
          type: "way",
          ref: 120,
          role: "outer",
          geometry: [
            { lat: 52.1002, lon: 21.5002 },
            { lat: 52.1002, lon: 21.5004 },
          ],
        },
        {
          type: "way",
          ref: 121,
          role: "outer",
          geometry: [
            { lat: 52.1002, lon: 21.5004 },
            { lat: 52.1004, lon: 21.5004 },
            { lat: 52.1004, lon: 21.5002 },
            { lat: 52.1002, lon: 21.5002 },
          ],
        },
        {
          type: "way",
          ref: 122,
          role: "inner",
          geometry: [
            { lat: 52.10025, lon: 21.50025 },
            { lat: 52.10025, lon: 21.5003 },
            { lat: 52.1003, lon: 21.5003 },
            { lat: 52.1003, lon: 21.50025 },
            { lat: 52.10025, lon: 21.50025 },
          ],
        },
      ],
    },
  ],
};

describe("createOpenStreetMapSurroundingsProvider", () => {
  it("maps Overpass water and land-use geometries to projected domain features", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(responsePayload));
    const provider = createOpenStreetMapSurroundingsProvider({
      endpoints: ["https://overpass.example/api/interpreter"],
      fetch,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const result = await provider.getFeatures(parcelGeometry);

    expect(result).toMatchObject({
      searchRadiusMeters: 1_000,
      source: {
        snapshotAt: "2026-11-21T11:55:00Z",
        retrievedAt: "2026-11-21T12:00:00.000Z",
      },
    });
    expect(result.hydrologyFeatures).toEqual([
      expect.objectContaining({ id: "way/10", kind: "stream", name: "Struga" }),
      expect.objectContaining({ id: "relation/12:0", kind: "pond" }),
    ]);
    expect(result.landUseFeatures).toEqual([
      expect.objectContaining({ id: "way/11:0", kind: "agriculture" }),
      expect.objectContaining({ id: "relation/12:0", kind: "water" }),
    ]);
    expect(result.hydrologyFeatures[0]?.geometry.coordinates[0]?.[0]).toBeGreaterThan(100_000);
    expect(result.hydrologyFeatures[1]?.geometry.coordinates).toHaveLength(2);

    const request = fetch.mock.calls[0];
    expect(request?.[0]).toBe("https://overpass.example/api/interpreter");
    expect(request?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "User-Agent": "KOWR-Water-Assistant/0.1" }),
    });
    expect(String(request?.[1]?.body)).toContain("waterway");
  });

  it("falls back once after a transient provider failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(Response.json(responsePayload));
    const logger = { warn: vi.fn() };
    const provider = createOpenStreetMapSurroundingsProvider({
      endpoints: ["https://primary.example", "https://fallback.example"],
      fetch,
      logger,
    });

    await expect(provider.getFeatures(parcelGeometry)).resolves.toMatchObject({
      hydrologyFeatures: expect.any(Array),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "OVERPASS_REQUEST_FAILED" }),
      "Parcel surroundings provider request failed",
    );
  });

  it("reuses a successful response for the same parcel bounds", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(responsePayload));
    const provider = createOpenStreetMapSurroundingsProvider({
      endpoints: ["https://overpass.example"],
      fetch,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    await provider.getFeatures(parcelGeometry);
    await provider.getFeatures(parcelGeometry);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Overpass availability", () => {
  it("starts with the verified Europe instance that covers Polish parcels", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(responsePayload));
    const provider = createOpenStreetMapSurroundingsProvider({ fetch, logger: { warn: vi.fn() } });
    await provider.getFeatures(parcelGeometry);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://ovp.dresel.systems/api/interpreter");
  });

  it("retries another instance when HTTP 200 contains an incomplete query result", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...responsePayload,
          elements: [],
          remark: "runtime error: Query timed out",
        }),
      )
      .mockResolvedValueOnce(Response.json(responsePayload));
    const provider = createOpenStreetMapSurroundingsProvider({
      fetch,
      logger: { warn: vi.fn() },
      endpoints: ["https://primary.example", "https://fallback.example"],
    });
    const result = await provider.getFeatures(parcelGeometry);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.landUseFeatures.length).toBeGreaterThan(0);
  });
});
