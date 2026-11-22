import { describe, expect, it } from "vitest";
import {
  calculateAvailableWaterCapacityRange,
  findRepresentativeInteriorPoint,
  SOIL_PROFILE_DEPTH_INTERVALS,
} from "./soil-profile.js";

describe("soil profile depth intervals", () => {
  it("preserves the six SoilGrids depth ranges", () => {
    expect(SOIL_PROFILE_DEPTH_INTERVALS).toEqual([
      { topDepthCm: 0, bottomDepthCm: 5 },
      { topDepthCm: 5, bottomDepthCm: 15 },
      { topDepthCm: 15, bottomDepthCm: 30 },
      { topDepthCm: 30, bottomDepthCm: 60 },
      { topDepthCm: 60, bottomDepthCm: 100 },
      { topDepthCm: 100, bottomDepthCm: 200 },
    ]);
  });
});

describe("calculateAvailableWaterCapacityRange", () => {
  it("calculates the 33 and 10 kPa variants without rounding", () => {
    const result = calculateAvailableWaterCapacityRange({
      waterContent10KpaPercent: 49.1,
      waterContent33KpaPercent: 37.4,
      waterContent1500KpaPercent: 7.1,
      topDepthCm: 0,
      bottomDepthCm: 5,
    });

    expect(result.using33Kpa?.volumetricPercent).toBeCloseTo(30.3);
    expect(result.using33Kpa?.millimeters).toBeCloseTo(15.15);
    expect(result.using10Kpa?.volumetricPercent).toBeCloseTo(42);
    expect(result.using10Kpa?.millimeters).toBeCloseTo(21);
  });

  it("uses the actual thickness of each SoilGrids layer", () => {
    expect(
      calculateAvailableWaterCapacityRange({
        waterContent10KpaPercent: 40,
        waterContent33KpaPercent: 30,
        waterContent1500KpaPercent: 10,
        topDepthCm: 100,
        bottomDepthCm: 200,
      }).using33Kpa,
    ).toEqual({ volumetricPercent: 20, millimeters: 200 });
  });

  it("returns null for missing or physically reversed inputs", () => {
    expect(
      calculateAvailableWaterCapacityRange({
        waterContent10KpaPercent: null,
        waterContent33KpaPercent: 8,
        waterContent1500KpaPercent: 10,
        topDepthCm: 0,
        bottomDepthCm: 5,
      }),
    ).toEqual({ using33Kpa: null, using10Kpa: null });
  });
});

describe("findRepresentativeInteriorPoint", () => {
  it("returns the centroid of a simple polygon", () => {
    expect(
      findRepresentativeInteriorPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([2, 1]);
  });

  it("falls back to an interior scanline for a concave polygon", () => {
    expect(
      findRepresentativeInteriorPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [3, 4],
            [3, 1],
            [1, 1],
            [1, 4],
            [0, 4],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([2, 0.5]);
  });

  it("does not select a point inside a polygon hole", () => {
    const point = findRepresentativeInteriorPoint({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    });

    expect(point).not.toBeNull();
    if (!point) return;

    expect(point[0]).toBeGreaterThan(0);
    expect(point[0]).toBeLessThan(10);
    expect(point[1]).toBeGreaterThan(0);
    expect(point[1]).toBeLessThan(10);
    expect(point[0] > 4 && point[0] < 6 && point[1] > 4 && point[1] < 6).toBe(false);
  });

  it("selects a point from the largest polygon in a multipolygon", () => {
    expect(
      findRepresentativeInteriorPoint({
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [14, 10],
              [14, 12],
              [10, 12],
              [10, 10],
            ],
          ],
        ],
      }),
    ).toEqual([12, 11]);
  });

  it("returns null for a degenerate geometry", () => {
    expect(
      findRepresentativeInteriorPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 0],
          ],
        ],
      }),
    ).toBeNull();
  });
});
