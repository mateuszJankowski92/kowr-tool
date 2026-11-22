import type {
  SoilProfileResponse,
  TerrainContextResponse,
  WaterAssessmentResponse,
} from "@kowr/contracts";
import { describe, expect, it } from "vitest";
import { createRecommendationContext } from "./recommendations";

describe("createRecommendationContext", () => {
  it("keeps unavailable spatial sources explicit", () => {
    const assessment = {
      status: "insufficient-data",
      balance: { classification: "insufficient-data" },
      scenarios: { stressDays: null, cumulativeEvapotranspirationDeficitMm: null },
      satellite: { consistency: "not-qualified" },
    } as WaterAssessmentResponse;

    const result = createRecommendationContext({
      crop: "pszenica-zwyczajna-jara",
      assessment,
      soil: null,
      terrain: null,
    });

    expect(result).toMatchObject({
      soil: { status: "unavailable" },
      terrain: { status: "unavailable" },
      hydrology: { status: "unavailable" },
      landUse: { status: "unavailable" },
    });
  });

  it("sums modelled available water only through the first metre", () => {
    const assessment = {
      status: "complete",
      balance: { classification: "elevated-shortage-risk" },
      scenarios: {
        stressDays: { minimum: 1, maximum: 4 },
        cumulativeEvapotranspirationDeficitMm: { minimum: 2, maximum: 8 },
      },
      satellite: { consistency: "neutral" },
    } as WaterAssessmentResponse;
    const soil = {
      status: "complete",
      layers: [
        {
          bottomDepthCm: 5,
          soilOrganicCarbonGramsPerKilogram: { q50: 12 },
          availableWaterCapacity: { using33Kpa: { millimeters: 1 } },
        },
        { bottomDepthCm: 15, availableWaterCapacity: { using33Kpa: { millimeters: 2 } } },
        { bottomDepthCm: 30, availableWaterCapacity: { using33Kpa: { millimeters: 3 } } },
        { bottomDepthCm: 60, availableWaterCapacity: { using33Kpa: { millimeters: 4 } } },
        { bottomDepthCm: 100, availableWaterCapacity: { using33Kpa: { millimeters: 5 } } },
        { bottomDepthCm: 200, availableWaterCapacity: { using33Kpa: { millimeters: 100 } } },
      ],
    } as unknown as SoilProfileResponse;
    const terrain = {
      terrain: { status: "unavailable" },
      surroundings: {
        hydrology: { status: "unavailable" },
        landUse: { status: "unavailable" },
      },
    } as TerrainContextResponse;

    expect(
      createRecommendationContext({ crop: "pszenica-zwyczajna-jara", assessment, soil, terrain })
        .soil.availableWaterCapacityMillimeters,
    ).toBe(15);
  });
});

describe("partial recommendation context", () => {
  it("preserves spatial data when the water assessment is unavailable", () => {
    expect(
      createRecommendationContext({
        crop: "pszenica-zwyczajna-jara",
        assessment: null,
        soil: null,
        terrain: null,
      }),
    ).toMatchObject({
      water: { status: "insufficient-data", classification: null, maximumStressDays: null },
      satellite: { consistency: "unavailable" },
    });
  });

  it("uses the agricultural share instead of total mapped land coverage", () => {
    const terrain = {
      terrain: { status: "unavailable" },
      surroundings: {
        hydrology: { status: "unavailable" },
        landUse: {
          status: "available",
          dominantClass: "agriculture",
          coveragePercent: 95,
          classes: [
            { kind: "agriculture", areaPercent: 60 },
            { kind: "forest", areaPercent: 35 },
          ],
        },
      },
    } as TerrainContextResponse;
    expect(
      createRecommendationContext({
        crop: "pszenica-zwyczajna-jara",
        assessment: null,
        soil: null,
        terrain,
      }).landUse.coveragePercent,
    ).toBe(60);
  });
});

describe("completed-period recommendations", () => {
  it("uses period stress rather than a recovered final day for post-season planning", () => {
    const assessment = {
      status: "complete",
      evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-07-02" },
      balance: { classification: "no-significant-shortage-indications" },
      scenarios: {
        totalCount: 8,
        completeCount: 8,
        stressDays: { minimum: 2, maximum: 12 },
        cumulativeEvapotranspirationDeficitMm: { minimum: 2, maximum: 20 },
      },
      satellite: { consistency: "not-qualified" },
    } as WaterAssessmentResponse;
    expect(
      createRecommendationContext({
        crop: "pszenica-zwyczajna-jara",
        assessment,
        soil: null,
        terrain: null,
      }).water,
    ).toMatchObject({ status: "complete", classification: "elevated-shortage-risk" });
  });
});

describe("requested-day versus seasonal action context", () => {
  it("uses completed-season evidence only for explicitly labelled crop planning", () => {
    const assessment = {
      status: "insufficient-data",
      evaluation: { scope: "analysis-day", evaluatedThroughDate: "2025-11-21" },
      completedSeason: {
        status: "complete",
        evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-07-02" },
        scenarios: {
          totalCount: 8,
          completeCount: 8,
          stressDays: { minimum: 2, maximum: 5 },
          cumulativeEvapotranspirationDeficitMm: { minimum: 1, maximum: 10 },
        },
        satellite: { consistency: "not-qualified" },
      },
    } as WaterAssessmentResponse;
    expect(
      createRecommendationContext({ crop: "bobik", assessment, soil: null, terrain: null }),
    ).toMatchObject({
      crop: "bobik",
      cropPeriod: "completed-season",
      water: { classification: "elevated-shortage-risk", maximumStressDays: 5 },
    });
  });
});
