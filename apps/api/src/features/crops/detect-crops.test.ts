import type { CropDetectionRequest } from "@kowr/contracts";
import { describe, expect, it } from "vitest";
import type { CropDetector, CropIntersectionResult } from "./crop-detector.js";
import { detectCrops } from "./detect-crops.js";

const request: CropDetectionRequest = {
  parcelIdentifier: "141201_1.0001.6509",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.5, 52.1],
        [21.6, 52.1],
        [21.6, 52.2],
        [21.5, 52.1],
      ],
    ],
  },
};

function createDetector(result: Partial<CropIntersectionResult>): CropDetector {
  return {
    async findIntersections() {
      return {
        complete: true,
        intersections: [],
        parcelAreaSquareMeters: 100,
        retrievedAt: "2026-11-21T12:00:00.000Z",
        ...result,
      };
    },
  };
}

describe("detectCrops", () => {
  it("suggests a declaration that covers at least 80 percent of detected crop area", async () => {
    const response = await detectCrops(
      request,
      createDetector({
        intersections: [
          {
            overlapAreaSquareMeters: 85,
            sourceGroup: "zboża",
            sourceLabel: "pszenica zwyczajna ozima",
          },
          {
            overlapAreaSquareMeters: 15,
            sourceGroup: "pastewne",
            sourceLabel: "kukurydza na ziarno",
          },
        ],
      }),
    );

    expect(response.status).toBe("suggested");
    expect(
      response.candidates.map(({ crop, overlapPercent }) => ({ crop, overlapPercent })),
    ).toEqual([
      { crop: "pszenica-zwyczajna-ozima", overlapPercent: 85 },
      { crop: "kukurydza-na-ziarno", overlapPercent: 15 },
    ]);
  });

  it("keeps a mixed declaration result for manual selection", async () => {
    const response = await detectCrops(
      request,
      createDetector({
        intersections: [
          {
            overlapAreaSquareMeters: 60,
            sourceGroup: "zboża",
            sourceLabel: "pszenica zwyczajna ozima",
          },
          {
            overlapAreaSquareMeters: 40,
            sourceGroup: "pastewne",
            sourceLabel: "kukurydza na ziarno",
          },
        ],
      }),
    );

    expect(response.status).toBe("multiple");
  });

  it("returns an honest no-data result", async () => {
    const response = await detectCrops(request, createDetector({}));
    expect(response.status).toBe("not_found");
    expect(response.candidates).toEqual([]);
  });
});
