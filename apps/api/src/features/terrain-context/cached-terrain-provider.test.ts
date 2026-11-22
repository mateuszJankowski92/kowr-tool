import { describe, expect, it, vi } from "vitest";
import { createCachedTerrainProvider } from "./cached-terrain-provider.js";
import type { ProvidedTerrainGrid } from "./terrain-provider.js";

const bounds = { west: 100, south: 200, east: 120, north: 220 };
const grid: ProvidedTerrainGrid = {
  bounds,
  columns: 2,
  rows: 2,
  cellSizeMeters: 10,
  heightsMeters: [1, 2, 3, 4],
  retrievedAt: "2026-11-22T00:00:00Z",
};

describe("terrain grid cache policy", () => {
  it("keeps a successful grid and its provenance available when a map source is retried", async () => {
    const getGrid = vi
      .fn()
      .mockResolvedValueOnce(structuredClone(grid))
      .mockRejectedValue(new Error("Offline"));
    const provider = createCachedTerrainProvider(
      { getGrid },
      () => new Date("2026-11-22T00:00:00Z"),
    );
    const first = await provider.getGrid(bounds, 2, 2);
    first.heightsMeters[0] = 999;
    expect(await provider.getGrid(bounds, 2, 2)).toEqual(grid);
    expect(getGrid).toHaveBeenCalledOnce();
  });

  it("does not cache failures, different resolutions, or expired grids", async () => {
    let time = Date.parse("2026-11-22T00:00:00Z");
    const getGrid = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(grid);
    const provider = createCachedTerrainProvider({ getGrid }, () => new Date(time));
    await expect(provider.getGrid(bounds, 2, 2)).rejects.toThrow("Offline");
    await provider.getGrid(bounds, 2, 2);
    await provider.getGrid(bounds, 3, 2);
    time += 30 * 60 * 1_000;
    await provider.getGrid(bounds, 2, 2);
    expect(getGrid).toHaveBeenCalledTimes(4);
  });

  it("honours cancellation even on a cached result", async () => {
    const provider = createCachedTerrainProvider(
      { getGrid: vi.fn().mockResolvedValue(grid) },
      () => new Date(0),
    );
    await provider.getGrid(bounds, 2, 2);
    await expect(provider.getGrid(bounds, 2, 2, AbortSignal.abort())).rejects.toThrow();
  });
});
