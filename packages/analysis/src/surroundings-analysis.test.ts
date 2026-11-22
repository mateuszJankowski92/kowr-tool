import { describe, expect, it } from "vitest";
import { analyzeParcelSurroundings } from "./surroundings-analysis.js";

const parcelGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ],
  ],
} as const;

describe("analyzeParcelSurroundings", () => {
  it("orders water objects by their actual distance from the parcel", () => {
    const result = analyzeParcelSurroundings({
      parcelGeometry,
      searchRadiusMeters: 1_000,
      hydrologyFeatures: [
        {
          id: "stream-nearby",
          kind: "stream",
          name: "Struga",
          geometry: {
            type: "LineString",
            coordinates: [
              [150, -20],
              [150, 120],
            ],
          },
        },
        {
          id: "pond-intersection",
          kind: "pond",
          name: null,
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [80, 80],
                [120, 80],
                [120, 120],
                [80, 120],
                [80, 80],
              ],
            ],
          },
        },
      ],
      landUseFeatures: [],
    });

    expect(result.hydrology).toMatchObject({
      objectCount: 2,
      nearestDistanceMeters: 0,
      intersectsParcel: true,
    });
    expect(result.hydrology.objects).toEqual([
      expect.objectContaining({ id: "pond-intersection", relation: "intersects-parcel" }),
      expect.objectContaining({
        id: "stream-nearby",
        distanceMeters: 50,
        relation: "adjacent",
      }),
    ]);
  });

  it("estimates mapped land-use shares without assigning uncovered area to a class", () => {
    const result = analyzeParcelSurroundings({
      parcelGeometry,
      searchRadiusMeters: 500,
      hydrologyFeatures: [],
      landUseFeatures: [
        {
          id: "field",
          kind: "agriculture",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [50, 0],
                [50, 100],
                [0, 100],
                [0, 0],
              ],
            ],
          },
        },
      ],
    });

    expect(result.landUse.coveragePercent).toBeCloseTo(50, 5);
    expect(result.landUse.dominantClass).toBe("agriculture");
    expect(result.landUse.classes).toEqual([
      expect.objectContaining({ kind: "agriculture", areaPercent: 50 }),
    ]);
    expect(result.landUse.classifiedPointCount).toBeLessThan(result.landUse.sampledPointCount);
  });

  it("uses deterministic precedence when mapped polygons overlap", () => {
    const fullParcel = [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ] as const;
    const result = analyzeParcelSurroundings({
      parcelGeometry,
      searchRadiusMeters: 500,
      hydrologyFeatures: [],
      landUseFeatures: [
        {
          id: "field",
          kind: "agriculture",
          geometry: { type: "Polygon", coordinates: fullParcel },
        },
        { id: "wet", kind: "wetland", geometry: { type: "Polygon", coordinates: fullParcel } },
      ],
    });

    expect(result.landUse.coveragePercent).toBe(100);
    expect(result.landUse.classes).toEqual([
      expect.objectContaining({ kind: "wetland", areaPercent: 100 }),
    ]);
  });

  it("excludes water objects beyond the declared search radius", () => {
    const result = analyzeParcelSurroundings({
      parcelGeometry,
      searchRadiusMeters: 100,
      hydrologyFeatures: [
        {
          id: "far-river",
          kind: "river",
          name: null,
          geometry: {
            type: "LineString",
            coordinates: [
              [500, 0],
              [500, 100],
            ],
          },
        },
      ],
      landUseFeatures: [],
    });

    expect(result.hydrology.objectCount).toBe(0);
    expect(result.hydrology.nearestDistanceMeters).toBeNull();
  });
});
