import { describe, expect, it, vi } from "vitest";
import { createGugikTerrainProvider } from "./gugik-terrain-provider.js";

describe("createGugikTerrainProvider", () => {
  it("normalizes the GUGiK EPSG:2180 ArcGrid axis order", async () => {
    const payload = [
      "ncols 2",
      "nrows 3",
      "xllcorner 100",
      "yllcorner 200",
      "cellsize 10",
      "NODATA_value -9999",
      "1 2",
      "3 4",
      "5 6",
    ].join("\n");
    const fetch = vi.fn().mockResolvedValue(
      new Response(payload, {
        status: 200,
        headers: { "content-type": "image/x-aaigrid" },
      }),
    );
    const provider = createGugikTerrainProvider({
      fetch,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const grid = await provider.getGrid({ west: 200, south: 100, east: 230, north: 120 }, 3, 2);

    expect(grid).toEqual({
      columns: 3,
      rows: 2,
      bounds: { west: 200, south: 100, east: 230, north: 120 },
      cellSizeMeters: 10,
      heightsMeters: [6, 4, 2, 5, 3, 1],
      retrievedAt: "2026-11-21T12:00:00.000Z",
    });
    const requestedUrl = new URL(fetch.mock.calls[0]?.[0] as string);
    expect(requestedUrl.searchParams.get("COVERAGEID")).toBe("DTM_PL-EVRF2007-NH");
    expect(requestedUrl.searchParams.getAll("SUBSET")).toEqual(["x(100,120)", "y(200,230)"]);
  });

  it("rejects an all-nodata coverage", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "ncols 2\nnrows 2\nxllcorner 100\nyllcorner 200\ncellsize 10\nNODATA_value -9999\n-9999 -9999\n-9999 -9999",
          { status: 200 },
        ),
      );
    const provider = createGugikTerrainProvider({ fetch, logger: { warn: vi.fn() } });

    await expect(
      provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2),
    ).rejects.toMatchObject({ code: "NO_DATA" });
  });
});
