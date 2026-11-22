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
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "connection reset", fail: () => Promise.reject(new TypeError("fetch failed")) },
    { name: "empty response", fail: () => Promise.resolve(new Response("")) },
    { name: "server failure", fail: () => Promise.resolve(new Response("", { status: 503 })) },
  ])("recovers after one transient $name using the same request deadline", async ({ fail }) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(fail)
      .mockResolvedValueOnce(
        new Response(
          "ncols 2\nnrows 2\nxllcorner 100\nyllcorner 200\ncellsize 10\nNODATA_value -9999\n1 2\n3 4",
        ),
      );
    const provider = createGugikTerrainProvider({ fetch, logger: { warn: vi.fn() } });

    const grid = await provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2);

    expect(grid.heightsMeters).toEqual([4, 2, 3, 1]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe(fetch.mock.calls[0]?.[0]);
    expect(fetch.mock.calls[1]?.[1]?.signal).toBe(fetch.mock.calls[0]?.[1]?.signal);
  });

  it("bounds retries and logs a safe failure code", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const warn = vi.fn();
    const provider = createGugikTerrainProvider({ fetch, logger: { warn } });

    await expect(
      provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "GUGiK NMT WCS", errorCode: "GUGIK_REQUEST_FAILED" }),
      expect.any(String),
    );
  });

  it.each([400, 403, 404, 429])("does not retry HTTP %i", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status }));
    const provider = createGugikTerrainProvider({ fetch, logger: { warn: vi.fn() } });

    await expect(
      provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not retry invalid grid contents", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<ExceptionReport />"));
    const provider = createGugikTerrainProvider({ fetch, logger: { warn: vi.fn() } });

    await expect(
      provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("propagates caller cancellation without retrying", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(controller.signal.reason);
    });
    const provider = createGugikTerrainProvider({ fetch, logger: { warn: vi.fn() } });

    await expect(
      provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2, controller.signal),
    ).rejects.toBe(controller.signal.reason);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not retry beyond the shared deadline", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const fetch = vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(controller.signal.reason);
      });
      const provider = createGugikTerrainProvider({ fetch, logger: { warn: vi.fn() } });

      await expect(
        provider.getGrid({ west: 200, south: 100, east: 220, north: 120 }, 2, 2),
      ).rejects.toMatchObject({ code: "TIMEOUT" });
      expect(fetch).toHaveBeenCalledOnce();
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });
});
