import type { ParcelGeometry, RecommendationItem } from "@kowr/contracts";
import { describe, expect, it } from "vitest";
import type { HydrologyData } from "../terrain-context/hydrology-map-features";
import { createPrintMapLayout, PRINT_MAP_SIZE } from "./print-map-geometry";

const parcel = {
  geometry: {
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
  } satisfies ParcelGeometry,
};
const water: HydrologyData["objects"] = [
  {
    id: "stream",
    kind: "stream",
    name: null,
    distanceMeters: 80,
    relation: "nearby",
    geometry: {
      type: "LineString",
      coordinates: [
        [21.502, 52.1],
        [21.502, 52.102],
      ],
    },
  },
  {
    id: "pond",
    kind: "pond",
    name: null,
    distanceMeters: 200,
    relation: "nearby",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [21.505, 52.1],
          [21.506, 52.1],
          [21.506, 52.101],
          [21.505, 52.1],
        ],
      ],
    },
  },
];

function expectVisible(point: number[]) {
  expect(point[0]).toBeGreaterThanOrEqual(0);
  expect(point[1]).toBeGreaterThanOrEqual(0);
  expect(point[0]).toBeLessThanOrEqual(PRINT_MAP_SIZE[0]);
  expect(point[1]).toBeLessThanOrEqual(PRINT_MAP_SIZE[1]);
}

describe("print map geometry", () => {
  it("fits the parcel with the same numbered water objects as the screen list", () => {
    const result = createPrintMapLayout({
      parcel,
      hydrology: { objects: water, searchRadiusMeters: 1_000 },
    });
    expect(result.water).toHaveLength(2);
    expect(result.water[0]?.path).toMatch(/^M.*L/);
    expect(result.water[1]?.polygon).toBe(true);
    expect(result.markers.map(({ number }) => number)).toEqual([1, 2]);
    for (const marker of result.markers) {
      expectVisible(marker.anchor);
      expectVisible(marker.position);
    }
    const [west = 0, south = 0, east = 0, north = 0] = result.backgroundExtent;
    expect((east - west) / (north - south)).toBeCloseTo(PRINT_MAP_SIZE[0] / PRINT_MAP_SIZE[1]);
  });

  it("anchors a long river near the parcel instead of at its remote first vertex", () => {
    const river = {
      ...water[0],
      geometry: {
        type: "LineString",
        coordinates: [
          [16, 49],
          [21.502, 52.1005],
          [24, 54],
        ],
      },
    } as HydrologyData["objects"][number];
    const result = createPrintMapLayout({
      parcel,
      hydrology: { objects: [river], searchRadiusMeters: 1_000 },
    });
    expectVisible(result.markers[0]?.anchor ?? []);
    const [west = 0, , east = 0] = result.backgroundExtent;
    expect(east - west).toBeLessThan(10_000);
  });

  it("separates overlapping inspection numbers without moving their source anchors", () => {
    const locations: RecommendationItem["locations"] = ["low-terrain-cell", "slope-cell"].map(
      (kind, index) => ({
        kind: kind as "low-terrain-cell" | "slope-cell",
        id: String(index),
        name: null,
        geometry: { type: "Point", coordinates: [21.5005, 52.1005] },
        source: "GUGiK NMT",
        resolutionMeters: 8,
        distanceMeters: 0,
      }),
    );
    const result = createPrintMapLayout({ parcel, locations });
    expect(result.markers[0]?.anchor).toEqual(result.markers[1]?.anchor);
    expect(result.markers[0]?.position).not.toEqual(result.markers[1]?.position);
    for (const marker of result.markers) expectVisible(marker.position);
  });

  it("keeps parcel holes and does not invent missing water objects", () => {
    const geometry: ParcelGeometry = {
      type: "Polygon",
      coordinates: [
        ...parcel.geometry.coordinates,
        [
          [21.5002, 52.1002],
          [21.5004, 52.1002],
          [21.5004, 52.1004],
          [21.5002, 52.1002],
        ],
      ],
    };
    const result = createPrintMapLayout({ parcel: { geometry } });
    expect(result.parcelPath.match(/Z/g)).toHaveLength(2);
    expect(result.water).toEqual([]);
    expect(result.markers).toEqual([]);
  });
});
