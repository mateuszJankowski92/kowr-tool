import type { ParcelResponse } from "@kowr/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type VectorLayer from "ol/layer/Vector.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HydrologyMap } from "./HydrologyMap";
import type { HydrologyData } from "./hydrology-map-features";

type MapEvent = { pixel: number[]; dragging?: boolean };
const mapHarness = vi.hoisted(() => ({
  listeners: new Map<string, (event: MapEvent) => void>(),
  hitId: null as string | null,
  fit: vi.fn(),
  waterLayer: null as VectorLayer | null,
}));

vi.mock("ol/Map.js", () => ({
  default: class {
    constructor(options: { layers: VectorLayer[] }) {
      mapHarness.waterLayer = options.layers[1] ?? null;
    }
    getSize() {
      return [320, 320];
    }
    getPixelFromCoordinate() {
      return [160, 60];
    }
    getCoordinateFromPixel(pixel: number[]) {
      return pixel;
    }
    addControl() {}
    updateSize() {}
    setTarget() {}
    dispose() {}
    getView() {
      return { fit: mapHarness.fit };
    }
    on(event: string, listener: (event: MapEvent) => void) {
      mapHarness.listeners.set(event, listener);
    }
    forEachFeatureAtPixel() {
      return mapHarness.hitId === null ? undefined : { getId: () => mapHarness.hitId };
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
const hydrology: HydrologyData = {
  status: "available",
  searchRadiusMeters: 1_000,
  objectCount: 1,
  nearestDistanceMeters: 50,
  intersectsParcel: false,
  objects: [
    {
      id: "way/10",
      kind: "ditch",
      name: null,
      distanceMeters: 50,
      relation: "adjacent",
      geometry: {
        type: "LineString",
        coordinates: [
          [21.502, 52.1],
          [21.502, 52.102],
        ],
      },
    },
  ],
  source: {
    provider: "OpenStreetMap contributors",
    dataset: "OpenStreetMap via Overpass API",
    horizontalCrs: "EPSG:4326 projected to EPSG:2180",
    snapshotAt: "2026-11-21T12:00:00.000Z",
    retrievedAt: "2026-11-21T12:00:00.000Z",
    usageTerms: "Open Database License 1.0 (ODbL)",
    sourceUrl: "https://www.openstreetmap.org/copyright",
  },
  limitations: [],
};

beforeEach(() => {
  mapHarness.listeners.clear();
  mapHarness.hitId = null;
  mapHarness.fit.mockClear();
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
  vi.unstubAllGlobals();
});

describe("HydrologyMap hover", () => {
  it("draws separate numbered markers with source connectors for coincident water objects", () => {
    const first = hydrology.objects[0];
    if (!first) throw new Error("Missing fixture object.");
    render(
      <HydrologyMap
        parcel={parcel}
        hydrology={{ ...hydrology, objects: [first, { ...first, id: "way/11" }] }}
        selectedId={null}
        highlightedId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const layer = mapHarness.waterLayer;
    const features = layer?.getSource()?.getFeatures() ?? [];
    const styles = features.map((feature) => layer?.getStyleFunction()?.(feature, 1));
    const markers = styles.map((style) => (Array.isArray(style) ? style.at(-1) : undefined));
    expect(markers.map((marker) => marker?.getText()?.getText())).toEqual(["1", "2"]);
    const positions = markers.map((marker) => marker?.getGeometry());
    expect(positions[0]).not.toEqual(positions[1]);
    for (const [index, style] of styles.entries()) {
      if (!Array.isArray(style)) throw new Error("Missing styles.");
      const feature = features[index];
      if (!feature) throw new Error("Missing feature.");
      expect(style[2]?.getGeometryFunction()(feature)?.getType()).toBe("LineString");
    }
  });

  it("reports hovered source IDs and clears them on empty space, dragging and pointer leave", () => {
    const onHover = vi.fn();
    const onSelect = vi.fn();
    render(
      <HydrologyMap
        parcel={parcel}
        hydrology={hydrology}
        selectedId={null}
        highlightedId={null}
        onHover={onHover}
        onSelect={onSelect}
      />,
    );
    const map = screen.getByRole("region", { name: /Mapa działki/ });
    mapHarness.fit.mockClear();
    mapHarness.hitId = "way/10";
    act(() => mapHarness.listeners.get("pointermove")?.({ pixel: [10, 10] }));
    expect(onHover).toHaveBeenLastCalledWith("way/10");
    expect(map.hasAttribute("data-water-hovered")).toBe(true);
    mapHarness.hitId = null;
    act(() => mapHarness.listeners.get("pointermove")?.({ pixel: [20, 20] }));
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(map.hasAttribute("data-water-hovered")).toBe(false);
    mapHarness.hitId = "way/10";
    act(() => mapHarness.listeners.get("pointermove")?.({ pixel: [10, 10], dragging: true }));
    expect(onHover).toHaveBeenLastCalledWith(null);
    act(() => mapHarness.listeners.get("pointermove")?.({ pixel: [10, 10] }));
    fireEvent.pointerLeave(map);
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(mapHarness.fit).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("updates highlighting without refitting or replacing the map", () => {
    const props = {
      parcel,
      hydrology,
      selectedId: "way/10",
      highlightedId: null,
      onHover: vi.fn(),
      onSelect: vi.fn(),
    };
    const { rerender } = render(<HydrologyMap {...props} />);
    mapHarness.fit.mockClear();
    rerender(<HydrologyMap {...props} highlightedId="way/10" />);
    rerender(<HydrologyMap {...props} highlightedId={null} />);
    expect(mapHarness.fit).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });
});
