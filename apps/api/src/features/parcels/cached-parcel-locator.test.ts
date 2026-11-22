import { describe, expect, it, vi } from "vitest";
import { createCachedParcelLocator } from "./cached-parcel-locator.js";
import type { LocatedParcel, ParcelLocator } from "./parcel-locator.js";

const parcel: LocatedParcel = {
  identifier: "280803_2.0024.149/4",
  parcelNumber: "149/4",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.26, 54.08],
        [21.27, 54.08],
        [21.27, 54.09],
        [21.26, 54.08],
      ],
    ],
  },
  administrativeArea: { voivodeship: null, county: null, commune: null, cadastralDistrict: null },
  provenance: {
    provider: "GUGiK ULDK",
    datasource: "powiat kętrzyński (wfs)",
    retrievedAt: "2026-11-22T02:14:01.607Z",
  },
};

function createLocator(): ParcelLocator {
  return {
    findByIdentifier: vi.fn().mockResolvedValue(structuredClone(parcel)),
    findByPoint: vi.fn().mockResolvedValue(structuredClone(parcel)),
  };
}

describe("parcel source cache", () => {
  it("reuses the selected parcel across independent report sources without changing provenance", async () => {
    const source = createLocator();
    const cached = createCachedParcelLocator(source, () => new Date("2026-11-22T02:15:00Z"));
    const first = await cached.findByIdentifier(parcel.identifier);
    if (!first) throw new Error("Expected parcel");
    first.parcelNumber = "changed";
    vi.mocked(source.findByIdentifier).mockRejectedValue(new Error("temporary provider outage"));
    expect(await cached.findByIdentifier(parcel.identifier)).toEqual(parcel);
    expect(source.findByIdentifier).toHaveBeenCalledOnce();
    await expect(cached.findByIdentifier("another-identifier")).rejects.toThrow(
      "temporary provider outage",
    );
  });

  it("reuses a parcel selected by point when report sources resolve its identifier", async () => {
    const source = createLocator();
    const cached = createCachedParcelLocator(source, () => new Date("2026-11-22T02:15:00Z"));
    await cached.findByPoint(21.263, 54.086);
    expect(await cached.findByIdentifier(parcel.identifier)).toEqual(parcel);
    expect(source.findByIdentifier).not.toHaveBeenCalled();
  });

  it("refreshes expired geometry and does not cache errors or not-found results", async () => {
    let now = new Date("2026-11-22T02:15:00Z");
    const source = createLocator();
    const cached = createCachedParcelLocator(source, () => now);
    await cached.findByIdentifier(parcel.identifier);
    now = new Date("2026-11-22T02:20:00Z");
    vi.mocked(source.findByIdentifier)
      .mockRejectedValueOnce(new Error("temporary provider outage"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(parcel);
    await expect(cached.findByIdentifier(parcel.identifier)).rejects.toThrow(
      "temporary provider outage",
    );
    expect(await cached.findByIdentifier(parcel.identifier)).toBeNull();
    expect(await cached.findByIdentifier(parcel.identifier)).toEqual(parcel);
    expect(source.findByIdentifier).toHaveBeenCalledTimes(4);
  });

  it("honours cancellation even for a cached parcel", async () => {
    const source = createLocator();
    const cached = createCachedParcelLocator(source, () => new Date("2026-11-22T02:15:00Z"));
    await cached.findByIdentifier(parcel.identifier);
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(
      cached.findByIdentifier(parcel.identifier, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(source.findByIdentifier).toHaveBeenCalledOnce();
  });
});
