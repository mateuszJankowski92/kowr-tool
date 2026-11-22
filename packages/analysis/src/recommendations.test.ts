import { describe, expect, it } from "vitest";
import { generateParcelRecommendations, type RecommendationInput } from "./recommendations.js";

const completeInput: RecommendationInput = {
  crop: { id: "pszenica-zwyczajna-jara", period: "active-season" },
  water: {
    status: "complete",
    classification: "elevated-shortage-risk",
    maximumStressDays: 12,
    maximumEvapotranspirationDeficitMm: 34,
  },
  soil: {
    status: "complete",
    topsoilOrganicCarbonGramsPerKilogram: 14,
    availableWaterCapacityMillimeters: 91,
  },
  terrain: {
    status: "available",
    typicalSlopeDegrees: 2.4,
    elevationRangeMeters: 4.2,
    inspectionPoints: [
      {
        id: "nmt-cell-1",
        kind: "slope-cell",
        coordinates: [21.5, 52.1],
        elevationMeters: 100,
        cellSizeMeters: 8,
      },
    ],
  },
  hydrology: {
    status: "available",
    intersectsParcel: false,
    nearestDistanceMeters: 48,
    objects: [
      {
        id: "way/1",
        name: "Rów",
        distanceMeters: 48,
        geometry: {
          type: "LineString",
          coordinates: [
            [21.5, 52.1],
            [21.501, 52.1],
          ],
        },
      },
    ],
  },
  landUse: { status: "available", dominantClass: "agriculture", coveragePercent: 92 },
  satellite: { consistency: "consistent-with-balance" },
};

describe("generateParcelRecommendations", () => {
  it("selects parcel-specific agronomic and retention actions with evidence", () => {
    const result = generateParcelRecommendations(completeInput);

    expect(result.status).toBe("complete");
    expect(result.items.map(({ id }) => id)).toEqual([
      "protect-soil-surface",
      "review-contour-practices",
      "build-soil-organic-matter",
      "inspect-nearby-water-network",
    ]);
    expect(result.items[0]?.evidence).toContainEqual({
      code: "modelled-water-stress",
      value: 12,
      unit: "days",
    });
  });

  it("does not propose earthworks when terrain and hydrology are unavailable", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      terrain: { status: "unavailable", typicalSlopeDegrees: null, elevationRangeMeters: null },
      hydrology: { status: "unavailable", intersectsParcel: null, nearestDistanceMeters: null },
    });

    expect(result.items.map(({ id }) => id)).not.toContain("review-contour-practices");
    expect(result.items.map(({ id }) => id)).not.toContain("inspect-nearby-water-network");
    expect(result.status).toBe("partial");
  });

  it("prioritises field verification when scenarios or satellite evidence conflict", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      water: { ...completeInput.water, status: "indeterminate", classification: "indeterminate" },
      satellite: { consistency: "conflicts-with-balance" },
    });

    expect(result.items[0]).toMatchObject({ id: "verify-field-conditions", priority: "high" });
  });
});

describe("terrain evidence", () => {
  it("identifies elevation range when that is the reason for reviewing contour practices", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      terrain: { status: "available", typicalSlopeDegrees: 0.4, elevationRangeMeters: 3 },
    });
    const action = result.items.find(({ id }) => id === "review-contour-practices");
    expect(action?.evidence).toContainEqual({ code: "terrain-relief", value: 3, unit: "meters" });
    expect(action?.evidence).not.toContainEqual({
      code: "terrain-relief",
      value: 0.4,
      unit: "degrees",
    });
  });
});

describe("recommendation uncertainty", () => {
  it("does not turn missing land-use classification into complete context", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      landUse: { status: "available", dominantClass: null, coveragePercent: 0 },
    });
    expect(result.status).toBe("partial");
    expect(result.items.map(({ id }) => id)).not.toContain("protect-soil-surface");
    expect(result.items.map(({ id }) => id)).not.toContain("review-contour-practices");
  });

  it("keeps a partial soil profile visible in recommendation completeness", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      soil: { ...completeInput.soil, status: "partial" },
    });
    expect(result.status).toBe("partial");
  });

  it("accepts a no-shortage result without inventing stress evidence", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      water: {
        status: "complete",
        classification: "no-significant-shortage-indications",
        maximumStressDays: 0,
        maximumEvapotranspirationDeficitMm: 0,
      },
    });
    expect(result.items.map(({ id }) => id)).toContain("maintain-water-conservation-practices");
    expect(result.items.flatMap(({ evidence }) => evidence).map(({ code }) => code)).not.toContain(
      "modelled-water-stress",
    );
  });
});

describe("complete balance with missing spatial context", () => {
  it("returns a justified verification action instead of an empty recommendation result", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      water: { ...completeInput.water, classification: "no-significant-shortage-indications" },
      hydrology: { status: "unavailable", intersectsParcel: null, nearestDistanceMeters: null },
      landUse: { status: "unavailable", dominantClass: null, coveragePercent: null },
      terrain: { status: "available", typicalSlopeDegrees: 0, elevationRangeMeters: 0 },
    });
    expect(result.status).toBe("partial");
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "verify-field-conditions",
        evidence: [expect.objectContaining({ code: "incomplete-inputs" })],
      }),
    ]);
  });
});

describe("crop applicability and places to inspect", () => {
  it("uses perennial row and shallow-root evidence for established strawberries", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      crop: { id: "truskawka", period: "active-season" },
    });
    expect(result.items.map(({ id }) => id)).not.toContain("protect-soil-surface");
    expect(result.items.find(({ id }) => id === "manage-perennial-cover")).toMatchObject({
      cropPractice: "perennial-interrows",
      evidence: expect.arrayContaining([{ code: "crop-root-depth", value: 0.2, unit: "meters" }]),
    });
  });

  it("selects a perennial action instead of annual residue advice for the same water signal", () => {
    const orchard = generateParcelRecommendations({
      ...completeInput,
      crop: { id: "jablon", period: "active-season" },
    });
    expect(orchard.items.map(({ id }) => id)).toContain("manage-perennial-cover");
    expect(orchard.items.map(({ id }) => id)).not.toContain("protect-soil-surface");
    expect(orchard.items.find(({ id }) => id === "manage-perennial-cover")).toMatchObject({
      cropPractice: "perennial-interrows",
    });
    expect(
      generateParcelRecommendations({
        ...completeInput,
        crop: { id: "bobik", period: "completed-season" },
      }).items[0],
    ).toMatchObject({ cropPractice: "annual-post-season" });
    expect(
      generateParcelRecommendations({
        ...completeInput,
        crop: { id: "mieta", period: "active-season" },
      }).items.find(({ id }) => id === "manage-perennial-cover"),
    ).toMatchObject({
      cropPractice: "perennial-sward",
    });
  });

  it("withholds field-crop practice advice for mushrooms", () => {
    const result = generateParcelRecommendations({
      ...completeInput,
      crop: { id: "pieczarka", period: "active-season" },
    });
    expect(result.status).toBe("partial");
    expect(result.items.map(({ id }) => id)).not.toContain("protect-soil-surface");
    expect(result.items.map(({ id }) => id)).toContain("verify-field-conditions");
  });

  it("links a water-network action to real submitted geometry within 100 metres", () => {
    const geometry = {
      type: "LineString" as const,
      coordinates: [
        [21, 52],
        [21.001, 52],
      ] as [number, number][],
    };
    const result = generateParcelRecommendations({
      ...completeInput,
      hydrology: {
        ...completeInput.hydrology,
        objects: [
          { id: "way/1", name: "Rów", distanceMeters: 48, geometry },
          { id: "way/2", name: null, distanceMeters: 101, geometry },
        ],
      },
    });
    expect(result.items.find(({ id }) => id === "inspect-nearby-water-network")?.locations).toEqual(
      [
        {
          id: "way/1",
          name: "Rów",
          kind: "water-object",
          geometry,
          source: "OpenStreetMap",
          resolutionMeters: null,
          distanceMeters: 48,
        },
      ],
    );
  });

  it("links terrain advice to sampled cells without inventing a position when points are absent", () => {
    const point = {
      id: "nmt-cell-9",
      kind: "slope-cell" as const,
      coordinates: [21.5, 52.1] as [number, number],
      elevationMeters: 100,
      cellSizeMeters: 8,
    };
    const result = generateParcelRecommendations({
      ...completeInput,
      terrain: { ...completeInput.terrain, inspectionPoints: [point] },
    });
    expect(result.items.find(({ id }) => id === "review-contour-practices")?.locations).toEqual([
      {
        id: point.id,
        kind: "slope-cell",
        name: null,
        geometry: { type: "Point", coordinates: point.coordinates },
        source: "GUGiK NMT",
        resolutionMeters: 8,
        distanceMeters: 0,
      },
    ]);
    expect(
      generateParcelRecommendations({
        ...completeInput,
        terrain: { ...completeInput.terrain, inspectionPoints: [] },
        hydrology: { ...completeInput.hydrology, objects: [] },
      }).items.every((item) => item.locations.length === 0),
    ).toBe(true);
  });
});
