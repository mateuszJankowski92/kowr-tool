import { describe, expect, it } from "vitest";
import { calculateTerrainMetrics, findTerrainInspectionCells } from "./terrain-analysis.js";

const parcelGeometry = {
  type: "Polygon" as const,
  coordinates: [
    [[0, 0] as const, [5, 0] as const, [5, 5] as const, [0, 5] as const, [0, 0] as const],
  ],
};

describe("calculateTerrainMetrics", () => {
  it("reports a flat parcel without inventing an aspect", () => {
    const metrics = calculateTerrainMetrics({
      columns: 5,
      rows: 5,
      bounds: { west: 0, south: 0, east: 5, north: 5 },
      heightsMeters: Array.from({ length: 25 }, () => 100),
      parcelGeometry,
    });

    expect(metrics).toEqual({
      minimumElevationMeters: 100,
      maximumElevationMeters: 100,
      elevationRangeMeters: 0,
      typicalSlopeDegrees: 0,
      steepSlopeP90Degrees: 0,
      dominantAspect: null,
      sampledCellCount: 25,
      slopeSampleCount: 9,
    });
  });

  it("derives the downhill aspect from the height surface", () => {
    const metrics = calculateTerrainMetrics({
      columns: 5,
      rows: 5,
      bounds: { west: 0, south: 0, east: 5, north: 5 },
      heightsMeters: Array.from({ length: 25 }, (_, index) => index % 5),
      parcelGeometry,
    });

    expect(metrics?.minimumElevationMeters).toBe(0);
    expect(metrics?.maximumElevationMeters).toBe(4);
    expect(metrics?.typicalSlopeDegrees).toBeCloseTo(45);
    expect(metrics?.dominantAspect).toBe("W");
  });

  it("returns null when no valid terrain sample falls inside the parcel", () => {
    expect(
      calculateTerrainMetrics({
        columns: 2,
        rows: 2,
        bounds: { west: 10, south: 10, east: 12, north: 12 },
        heightsMeters: [1, 2, 3, 4],
        parcelGeometry,
      }),
    ).toBeNull();
  });
});

describe("findTerrainInspectionCells", () => {
  it("selects the largest central-difference slope rather than the highest elevation", () => {
    const cells = findTerrainInspectionCells({
      columns: 5,
      rows: 5,
      bounds: { west: 0, south: 0, east: 5, north: 5 },
      heightsMeters: Array.from({ length: 25 }, (_, index) => (index % 5) ** 2),
      parcelGeometry,
    });
    // dz/dx = 2x: the last interior column has the greatest slope; edge cells lack neighbors.
    expect(cells.find(({ kind }) => kind === "slope-cell")).toMatchObject({
      id: "nmt-cell-8",
      position: [3.5, 3.5],
      elevationMeters: 9,
      cellSizeMeters: 1,
    });
  });

  it("does not assign a slope to a cell whose neighbor is missing", () => {
    const heightsWithGap: (number | null)[] = Array.from({ length: 9 }, () => 100);
    heightsWithGap[3] = null;
    heightsWithGap[5] = 120;
    const cells = findTerrainInspectionCells({
      columns: 3,
      rows: 3,
      bounds: { west: 0, south: 0, east: 3, north: 3 },
      heightsMeters: heightsWithGap,
      parcelGeometry,
    });
    expect(cells.some(({ kind }) => kind === "slope-cell")).toBe(false);
  });

  it("excludes outside cells, holes and missing heights from inspection positions", () => {
    const cells = findTerrainInspectionCells({
      columns: 5,
      rows: 5,
      bounds: { west: 0, south: 0, east: 5, north: 5 },
      heightsMeters: Array.from({ length: 25 }, (_, index) => (index === 6 ? null : index)),
      parcelGeometry: {
        type: "Polygon",
        coordinates: [
          [
            [1, 1],
            [4, 1],
            [4, 4],
            [1, 4],
            [1, 1],
          ],
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
            [2, 2],
          ],
        ],
      },
    });
    expect(cells[0]).toMatchObject({
      kind: "low-terrain-cell",
      id: "nmt-cell-7",
      position: [2.5, 3.5],
      elevationMeters: 7,
      cellSizeMeters: 1,
    });
    expect(cells.some((cell) => cell.id === "nmt-cell-12")).toBe(false);
    expect(
      cells.every(
        ({ position }) => position[0] > 1 && position[0] < 4 && position[1] > 1 && position[1] < 4,
      ),
    ).toBe(true);
  });

  it("does not invent a depression on flat terrain or with no valid parcel samples", () => {
    for (const value of [100, null]) {
      expect(
        findTerrainInspectionCells({
          columns: 5,
          rows: 5,
          bounds: { west: 0, south: 0, east: 5, north: 5 },
          heightsMeters: Array.from({ length: 25 }, () => value),
          parcelGeometry,
        }),
      ).toEqual([]);
    }
  });
});
