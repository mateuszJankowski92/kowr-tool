import type { ProjectedParcelGeometry } from "@kowr/contracts";
import { describe, expect, it } from "vitest";
import { createTerrainRequest } from "./terrain-geometry.js";

describe("createTerrainRequest", () => {
  it("expands a compact parcel into a landscape terrain context", () => {
    const geometry: ProjectedParcelGeometry = {
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
    };

    const request = createTerrainRequest(geometry);
    const width = request.bounds.east - request.bounds.west;
    const height = request.bounds.north - request.bounds.south;

    expect(width / height).toBeCloseTo(2, 5);
    expect((request.bounds.west + request.bounds.east) / 2).toBeCloseTo(50, 5);
    expect(request.bounds.west).toBe(-200);
    expect(request.bounds.east).toBe(300);
    expect(request.columns).toBe(128);
  });

  it("preserves a parcel context that is already wider than the target ratio", () => {
    const geometry: ProjectedParcelGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [500, 0],
          [500, 40],
          [0, 40],
          [0, 0],
        ],
      ],
    };

    const request = createTerrainRequest(geometry);

    expect(request.bounds.west).toBe(-175);
    expect(request.bounds.east).toBe(675);
  });
});
