import type { ProvidedTerrainGrid, TerrainProvider } from "./terrain-provider.js";

const GRID_TTL_MS = 30 * 60 * 1_000;
const MAXIMUM_CACHED_GRIDS = 128;

/** Retain successful terrain samples while independent map sources are retried. */
export function createCachedTerrainProvider(
  provider: TerrainProvider,
  clock: () => Date,
): TerrainProvider {
  const cache = new Map<string, { expiresAt: number; grid: ProvidedTerrainGrid }>();
  return {
    async getGrid(bounds, columns, rows, signal) {
      signal?.throwIfAborted();
      const key = JSON.stringify([
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
        columns,
        rows,
      ]);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > clock().getTime()) return structuredClone(cached.grid);
      cache.delete(key);
      const grid = await provider.getGrid(bounds, columns, rows, signal);
      // Failed requests never populate this cache; provenance retains the actual retrieval time.
      cache.set(key, { expiresAt: clock().getTime() + GRID_TTL_MS, grid: structuredClone(grid) });
      if (cache.size > MAXIMUM_CACHED_GRIDS) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      return grid;
    },
  };
}
