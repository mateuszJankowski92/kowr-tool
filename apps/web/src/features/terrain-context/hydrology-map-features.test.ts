import type { ParcelGeometry } from "@kowr/contracts";
import { containsExtent } from "ol/extent.js";
import { describe, expect, it } from "vitest";
import { createHydrologyMapFeatures, type HydrologyData } from "./hydrology-map-features";

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
const objects: HydrologyData["objects"] = [
  {
    id: "stream",
    kind: "stream",
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

describe("hydrology map features", () => {
  it("preserves lines and polygons, numbers them in list order and fits the parcel with all objects", () => {
    const map = createHydrologyMapFeatures(parcel, { objects, searchRadiusMeters: 1_000 });
    expect(map.waterFeatures.map((feature) => feature.getId())).toEqual(["stream", "pond"]);
    expect(map.waterFeatures.map((feature) => feature.get("number"))).toEqual([1, 2]);
    expect(map.waterFeatures.map((feature) => feature.getGeometry()?.getType())).toEqual([
      "LineString",
      "Polygon",
    ]);
    const parcelExtent = map.parcelFeature.getGeometry()?.getExtent();
    expect(parcelExtent?.[0]).toBeGreaterThan(100_000);
    expect(containsExtent(map.fitExtent(null), parcelExtent ?? [])).toBe(true);
    for (const feature of map.waterFeatures) {
      expect(containsExtent(map.fitExtent(null), feature.getGeometry()?.getExtent() ?? [])).toBe(
        true,
      );
    }
    const selectedExtent = map.fitExtent("stream");
    expect(containsExtent(selectedExtent, parcelExtent ?? [])).toBe(true);
    expect(
      containsExtent(selectedExtent, map.waterFeatures[1]?.getGeometry()?.getExtent() ?? []),
    ).toBe(false);
  });

  it("limits long rivers to the local search extent when fitting", () => {
    const river = {
      ...objects[0],
      id: "river",
      geometry: {
        type: "LineString",
        coordinates: [
          [21.5, 52.1],
          [23, 53],
        ],
      },
    } as HydrologyData["objects"][number];
    const map = createHydrologyMapFeatures(parcel, { objects: [river], searchRadiusMeters: 1_000 });
    expect(containsExtent(map.searchExtent, map.fitExtent(null))).toBe(true);
    expect(
      containsExtent(map.fitExtent(null), map.waterFeatures[0]?.getGeometry()?.getExtent() ?? []),
    ).toBe(false);
  });

  it("only maps the four listed objects and handles an empty result", () => {
    const manyObjects = Array.from({ length: 6 }, (_, index) => ({
      ...objects[0],
      id: String(index),
    })) as HydrologyData["objects"];
    expect(
      createHydrologyMapFeatures(parcel, { objects: manyObjects, searchRadiusMeters: 1_000 })
        .waterFeatures,
    ).toHaveLength(4);
    const emptyMap = createHydrologyMapFeatures(parcel, { objects: [], searchRadiusMeters: 1_000 });
    expect(emptyMap.fitExtent(null)).toEqual(emptyMap.parcelFeature.getGeometry()?.getExtent());
  });
});
