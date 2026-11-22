import type { ParcelResponse, RecommendationItem } from "@kowr/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buffer } from "ol/extent.js";
import type LineString from "ol/geom/LineString.js";
import type Point from "ol/geom/Point.js";
import type TileLayer from "ol/layer/Tile.js";
import type VectorLayer from "ol/layer/Vector.js";
import type WMTS from "ol/source/WMTS.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetentionLocationsMap } from "./RetentionLocationsMap";

const harness = vi.hoisted(() => ({
  base: null as TileLayer<WMTS> | null,
  vector: null as VectorLayer | null,
  fit: vi.fn(),
  setZoom: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("ol/Map.js", () => ({
  default: class {
    constructor(options: { layers: [TileLayer<WMTS>, VectorLayer] }) {
      [harness.base, harness.vector] = options.layers;
    }
    getSize() {
      return [320, 320];
    }
    getPixelFromCoordinate() {
      return [160, 160];
    }
    getCoordinateFromPixel(pixel: number[]) {
      return pixel;
    }
    getView() {
      return { fit: harness.fit, getZoom: () => 17, setZoom: harness.setZoom };
    }
    on() {}
    updateSize() {}
    setTarget() {}
    dispose() {
      harness.dispose();
    }
  },
}));

const parcel = {
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.5, 52.1],
        [21.501, 52.1],
        [21.501, 52.101],
        [21.5, 52.1],
      ],
    ],
  },
} as ParcelResponse;

const locations: RecommendationItem["locations"] = [
  {
    id: "cell-1",
    kind: "low-terrain-cell",
    name: null,
    geometry: { type: "Point", coordinates: [21.5005, 52.1005] },
    source: "GUGiK NMT",
    resolutionMeters: 8,
    distanceMeters: 0,
  },
  {
    id: "cell-2",
    kind: "slope-cell",
    name: null,
    geometry: { type: "Point", coordinates: [21.5005, 52.1005] },
    source: "GUGiK NMT",
    resolutionMeters: 8,
    distanceMeters: 0,
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: (name: string) => (name === "--primary" ? "#246448" : "#ffffff"),
  } as CSSStyleDeclaration);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RetentionLocationsMap", () => {
  it("focuses and highlights the requested place without recreating the map", () => {
    const view = render(<RetentionLocationsMap parcel={parcel} locations={locations} />);
    const layer = harness.vector;
    const selected = layer
      ?.getSource()
      ?.getFeatures()
      .find((feature) => feature.get("number") === 2);
    if (!layer || !selected) throw new Error("Missing selected location feature.");
    harness.fit.mockClear();
    view.rerender(
      <RetentionLocationsMap
        parcel={parcel}
        locations={locations}
        selection={{ key: "slope-cell:cell-2" }}
      />,
    );
    expect(harness.vector).toBe(layer);
    const extent = selected.getGeometry()?.getExtent();
    if (!extent) throw new Error("Missing selected extent.");
    expect(harness.fit).toHaveBeenLastCalledWith(buffer(extent, 30), {
      padding: [55, 76, 55, 55],
      maxZoom: 18,
    });
    expect(screen.getByText(/Wybrane miejsce: 2/)).not.toBeNull();
    const styles = layer.getStyleFunction()?.(selected, 1);
    if (!Array.isArray(styles)) throw new Error("Missing selected styles.");
    expect(styles.at(-1)?.getZIndex()).toBe(6);
    expect(harness.dispose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pokaż całą działkę i miejsca" }));
    harness.fit.mockClear();
    view.rerender(
      <RetentionLocationsMap
        parcel={parcel}
        locations={locations}
        selection={{ key: "slope-cell:cell-2" }}
      />,
    );
    expect(harness.fit).toHaveBeenCalledOnce();
    expect(harness.fit).toHaveBeenLastCalledWith(buffer(extent, 30), {
      padding: [55, 76, 55, 55],
      maxZoom: 18,
    });
  });

  it("enables orthophotography and reports loading until a tile arrives", () => {
    render(<RetentionLocationsMap parcel={parcel} locations={locations} />);
    expect(harness.base?.getVisible()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Pobieranie ortofotomapy");
    act(() => harness.base?.getSource()?.dispatchEvent("tileloadend"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps geometry visible after a timeout and supports retry without hiding tile failures", () => {
    const { unmount } = render(<RetentionLocationsMap parcel={parcel} locations={locations} />);
    const source = harness.base?.getSource();
    if (!source) throw new Error("Missing imagery source.");
    const refresh = vi.spyOn(source, "refresh");
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("status").textContent).toContain("Ortofotomapa jest niedostępna");
    expect(harness.vector?.getSource()?.getFeatures()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Ponów podkład" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("Pobieranie ortofotomapy");
    act(() => {
      source.dispatchEvent("tileloaderror");
      source.dispatchEvent("tileloadend");
    });
    expect(screen.getByRole("status").textContent).toContain("Ortofotomapa jest niedostępna");
    fireEvent.click(screen.getByRole("button", { name: "Ponów podkład" }));
    act(() => source.dispatchEvent("tileloadend"));
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
    expect(harness.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("separates overlapping numbers while connecting them to unchanged source locations", () => {
    render(<RetentionLocationsMap parcel={parcel} locations={locations} />);
    const layer = harness.vector;
    const features = layer
      ?.getSource()
      ?.getFeatures()
      .filter((feature) => !feature.get("parcel"));
    if (!layer || !features) throw new Error("Missing location features.");
    const geometries = features.map((feature) => (feature.getGeometry() as Point).getCoordinates());
    const markers = features.map((feature) => {
      const styles = layer.getStyleFunction()?.(feature, 1);
      if (!Array.isArray(styles)) throw new Error("Missing marker styles.");
      const connector = styles[3]?.getGeometry() as LineString;
      expect(connector.getFirstCoordinate()).toEqual(geometries[0]);
      const marker = styles.at(-1);
      if (!marker) throw new Error("Missing numbered marker.");
      return marker;
    });
    expect(markers.map((marker) => marker?.getText()?.getText())).toEqual(["1", "2"]);
    const positions = markers.map((marker) => (marker.getGeometry() as Point).getCoordinates());
    expect(positions[0]).not.toEqual(positions[1]);
    expect(features.map((feature) => (feature.getGeometry() as Point).getCoordinates())).toEqual(
      geometries,
    );
  });

  it("supports zoom and restoring the full extent through labeled buttons", () => {
    render(<RetentionLocationsMap parcel={parcel} locations={locations} />);
    harness.fit.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Przybliż mapę" }));
    expect(harness.setZoom).toHaveBeenLastCalledWith(18);
    fireEvent.click(screen.getByRole("button", { name: "Oddal mapę" }));
    expect(harness.setZoom).toHaveBeenLastCalledWith(16);
    fireEvent.click(screen.getByRole("button", { name: "Pokaż całą działkę i miejsca" }));
    expect(harness.fit).toHaveBeenCalledOnce();
  });
});
