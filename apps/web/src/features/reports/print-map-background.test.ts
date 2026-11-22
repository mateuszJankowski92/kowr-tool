import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrintMapBackground } from "./print-map-background";

const harness = vi.hoisted(() => ({
  dispose: vi.fn(),
  draw: vi.fn(),
  encode: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../map/map-config", () => ({
  POLISH_PROJECTION: {},
  createOrthophotoLayer: () => ({
    dispose: harness.dispose,
    getSource: () => ({
      dispose: harness.dispose,
      getTileUrlFunction:
        () =>
        ([, x]: number[]) =>
          `https://example.test/tile-${x}.jpg`,
      getTileGridForProjection: () => ({
        getZForResolution: () => 0,
        getTileSize: () => 512,
        getResolution: () => 50 / 512,
        getTileRangeForExtentAndZ: () => ({ minX: 0, maxX: 1, minY: 0, maxY: 0 }),
        getTileCoordExtent: ([, x = 0]: number[]) => [x * 50, 0, (x + 1) * 50, 50],
      }),
    }),
  }),
}));
// The geometry module registers projections; only the raster size is needed here.
vi.mock("./print-map-geometry", () => ({ PRINT_MAP_SIZE: [600, 260] }));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: harness.draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(harness.encode);
  harness.encode.mockReturnValue("data:image/jpeg;base64,dGVzdA==");
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: harness.close })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(new Blob(["test"], { type: "image/jpeg" }), {
          headers: { "content-type": "image/jpeg" },
        }),
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("print map background", () => {
  it("composes real tile responses at the same projected bounds as the vector overlay", async () => {
    const result = await getPrintMapBackground([0, 0, 100, 50], new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(harness.draw.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, 0, 512, 512],
      [512, 0, 512, 512],
      [0, 0, 1200, 600],
    ]);
    expect(result.imageDataUrl).toBe("data:image/jpeg;base64,dGVzdA==");
    expect(result.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(harness.close).toHaveBeenCalledTimes(2);
  });

  it("rejects an XML provider error instead of printing it as an empty successful map", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("provider error", { headers: { "content-type": "text/xml" } }),
    );
    await expect(
      getPrintMapBackground([0, 0, 100, 50], new AbortController().signal),
    ).rejects.toThrow();
    expect(harness.encode).not.toHaveBeenCalled();
    expect(harness.dispose).toHaveBeenCalled();
  });

  it("aborts pending tile requests after the bounded preparation timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const pending = getPrintMapBackground([0, 0, 100, 50], new AbortController().signal);
    const rejection = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(12_000);
    await rejection;
    expect(harness.encode).not.toHaveBeenCalled();
  });

  it("propagates cancellation without requesting tiles", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getPrintMapBackground([0, 0, 100, 50], controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
