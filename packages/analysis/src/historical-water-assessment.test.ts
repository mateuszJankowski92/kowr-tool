import { describe, expect, it } from "vitest";
import type { Fao56DailyWeather, Fao56PhenologyScenario } from "./fao56-season-engine.js";
import { simulateFao56Season } from "./fao56-season-engine.js";
import {
  aggregateHistoricalWaterAssessment,
  type HistoricalSeasonPlan,
  type HistoricalSeasonSimulation,
  planAnalogousHistoricalSeasons,
  shiftCalendarDateByYears,
} from "./historical-water-assessment.js";

const DAY_MILLISECONDS = 86_400_000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

function phenology(seasonStartDate = "2025-04-01"): Fao56PhenologyScenario {
  return {
    id: "declared-phenology",
    seasonStartDate,
    durations: { initialDays: 5, developmentDays: 5, midSeasonDays: 10, lateSeasonDays: 5 },
    initialRootDepthMeters: 0.2,
    source: "user-supplied",
    description: "Declared test phenology",
  };
}

function weather(startDate: string, days: number, precipitationMm: number): Fao56DailyWeather[] {
  return Array.from({ length: days }, (_, index) => ({
    date: addDays(startDate, index),
    precipitationMm,
    referenceEvapotranspirationMm: 5,
    runoffMm: null,
    irrigationMm: null,
    capillaryRiseMm: null,
  }));
}

const soilLayers = [
  [0, 0.05],
  [0.05, 0.15],
  [0.15, 0.3],
  [0.3, 0.6],
  [0.6, 1],
  [1, 2],
].map(([topDepthMeters, bottomDepthMeters]) => ({
  topDepthMeters: topDepthMeters ?? 0,
  bottomDepthMeters: bottomDepthMeters ?? 0,
  fieldCapacity10KpaVolumetricFraction: 0.36,
  fieldCapacity33KpaVolumetricFraction: 0.29,
  wiltingPointVolumetricFraction: 0.12,
}));

function plan(year: number): HistoricalSeasonPlan {
  const periodStartDate = `${year}-04-01`;
  return {
    referenceYear: year,
    analysisDate: `${year}-04-25`,
    phenologyScenarios: [phenology(periodStartDate)],
    periodStartDate,
    periodEndDate: `${year}-04-25`,
  };
}

function simulation(year: number, precipitationMm: number): HistoricalSeasonSimulation {
  const historicalPlan = plan(year);
  return {
    plan: historicalPlan,
    engineResult: simulateFao56Season({
      cropProfileId: "potato",
      analysisDate: historicalPlan.analysisDate,
      dailyWeather: weather(historicalPlan.periodStartDate, 25, precipitationMm),
      soilLayers,
      phenologyScenarios: historicalPlan.phenologyScenarios,
      wettingTiming: "early-day",
      depletionFractionMode: "adjust-for-etc",
      unknownFluxPolicy: "assume-zero-and-report",
    }),
    incompleteReasonCodes: [],
  };
}

function simulationWithDailyWeather(
  historicalPlan: HistoricalSeasonPlan,
  dailyWeather: Fao56DailyWeather[],
): HistoricalSeasonSimulation {
  return {
    plan: historicalPlan,
    engineResult: simulateFao56Season({
      cropProfileId: "potato",
      analysisDate: historicalPlan.analysisDate,
      dailyWeather,
      soilLayers,
      phenologyScenarios: historicalPlan.phenologyScenarios,
      wettingTiming: "early-day",
      depletionFractionMode: "adjust-for-etc",
      unknownFluxPolicy: "assume-zero-and-report",
    }),
    incompleteReasonCodes: [],
  };
}

describe("historical season planning", () => {
  it("plans exactly the ten years preceding the analysis year", () => {
    const plans = planAnalogousHistoricalSeasons({
      analysisDate: "2025-06-30",
      phenologyScenarios: [phenology("2025-03-20")],
    });

    expect(plans.map(({ referenceYear }) => referenceYear)).toEqual([
      2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015,
    ]);
    expect(plans[0]).toMatchObject({
      periodStartDate: "2024-03-20",
      periodEndDate: "2024-06-30",
    });
  });

  it("preserves a winter season's cross-year relationship", () => {
    const [historical] = planAnalogousHistoricalSeasons({
      analysisDate: "2025-02-20",
      phenologyScenarios: [phenology("2024-10-15")],
      seasonCount: 1,
    });

    expect(historical).toMatchObject({
      referenceYear: 2024,
      periodStartDate: "2023-10-15",
      periodEndDate: "2024-02-20",
    });
  });

  it("clamps 29 February to 28 February in non-leap target years", () => {
    expect(shiftCalendarDateByYears("2024-02-29", -1)).toBe("2023-02-28");
    expect(shiftCalendarDateByYears("2024-02-29", -4)).toBe("2020-02-29");
  });
});

describe("historical water assessment aggregation", () => {
  it("reports a complete result for ten scientifically complete seasons", () => {
    const result = aggregateHistoricalWaterAssessment(
      Array.from({ length: 10 }, (_, index) => simulation(2024 - index, index % 2 === 0 ? 0 : 12)),
    );

    expect(result).toMatchObject({
      status: "complete",
      requiredSeasonCount: 10,
      completeSeasonCount: 10,
      incompleteSeasonCount: 0,
    });
    expect(
      result.seasonsWithModelledStress +
        result.seasonsWithoutModelledStress +
        result.ambiguousSeasonCount,
    ).toBe(10);
  });

  it("uses complete seasons as the denominator and never counts missing years as no stress", () => {
    const simulations = Array.from({ length: 10 }, (_, index) => simulation(2024 - index, 12));
    simulations[3] = {
      plan: plan(2021),
      engineResult: null,
      incompleteReasonCodes: ["WEATHER_UNAVAILABLE"],
    };

    const result = aggregateHistoricalWaterAssessment(simulations);

    expect(result.status).toBe("partial");
    expect(result.completeSeasonCount).toBe(9);
    expect(result.incompleteSeasonCount).toBe(1);
    expect(result.noStressOccurrence.denominator).toBe(9);
    expect(result.seasons.find(({ referenceYear }) => referenceYear === 2021)).toMatchObject({
      status: "incomplete",
      conclusion: "unavailable",
      incompleteReasonCodes: ["WEATHER_UNAVAILABLE"],
    });
  });

  it("returns insufficient data when no season can be completed", () => {
    const result = aggregateHistoricalWaterAssessment(
      Array.from({ length: 10 }, (_, index) => ({
        plan: plan(2024 - index),
        engineResult: null,
        incompleteReasonCodes: ["MISSING_WEATHER_DAY"],
      })),
    );

    expect(result).toMatchObject({
      status: "insufficient-data",
      completeSeasonCount: 0,
      incompleteSeasonCount: 10,
      stressOccurrence: { numerator: 0, denominator: 0 },
      actualDataPeriod: null,
    });
  });

  it("aggregates stress episodes and recurrence by phase and season position", () => {
    const result = aggregateHistoricalWaterAssessment([
      simulation(2024, 0),
      simulation(2023, 0),
      simulation(2022, 12),
    ]);

    expect(result.completeSeasonCount).toBe(3);
    expect(result.longestStressEpisodeDays).toBeGreaterThan(0);
    expect(result.stressDaysRange?.maximum).toBeGreaterThan(0);
    expect(
      result.recurrence.growthStages.some(({ stressScenarioDays }) => stressScenarioDays > 0),
    ).toBe(true);
    expect(result.recurrence.mostAffectedDayPositions[0]).toMatchObject({
      completeSeasonCount: 3,
    });
  });

  it("separates stress during the period from a recovered final day", () => {
    const historicalPlan = plan(2024);
    const dailyWeather = weather(historicalPlan.periodStartDate, 25, 0).map((day, index) => ({
      ...day,
      precipitationMm: index >= 15 ? 50 : 0,
    }));

    const result = aggregateHistoricalWaterAssessment([
      simulationWithDailyWeather(historicalPlan, dailyWeather),
    ]);

    expect(result.seasons[0]).toMatchObject({
      conclusion: "modelled-stress",
      finalDayConclusion: "no-modelled-stress",
    });
    expect(result.seasons[0]?.stressDays?.minimum).toBeGreaterThan(0);
    expect(result.seasons[0]?.longestStressEpisodeDaysRange?.maximum).toBeGreaterThan(0);
    expect(result.seasons[0]?.minimumWaterStressCoefficientRange?.minimum).toBeLessThan(1);
    expect(result.seasons[0]?.initialConditionSensitivity.convergence.classification).toBe(
      "converged",
    );
  });

  it("reports stress caused only by the dry initial-state bound as assumption-dependent", () => {
    const historicalPlan: HistoricalSeasonPlan = {
      ...plan(2024),
      analysisDate: "2024-04-01",
      periodEndDate: "2024-04-01",
    };
    const result = aggregateHistoricalWaterAssessment([
      simulationWithDailyWeather(historicalPlan, weather("2024-04-01", 1, 0)),
    ]);
    const season = result.seasons[0];

    expect(season?.conclusion).toBe("ambiguous");
    expect(season?.initialConditionSensitivity.classification).toBe("dry-start-only");
    expect(season?.initialConditionSensitivity.convergence).toMatchObject({
      classification: "persistent",
      convergedPairCount: 0,
    });
    expect(season?.growthStages[0]).toMatchObject({
      growthStage: "initial",
      conclusion: "ambiguous",
    });
    expect(result.recurrence.growthStages[0]).toMatchObject({
      seasonsWithStress: 0,
      scenarioDependentSeasonCount: 1,
      seasonsWithoutStress: 0,
    });
  });

  it("marks a season incomplete when a required weather day is absent", () => {
    const historicalPlan = plan(2024);
    const engineResult = simulateFao56Season({
      cropProfileId: "potato",
      analysisDate: historicalPlan.analysisDate,
      dailyWeather: weather(historicalPlan.periodStartDate, 25, 0).filter(
        ({ date }) => date !== "2024-04-10",
      ),
      soilLayers,
      phenologyScenarios: historicalPlan.phenologyScenarios,
      wettingTiming: "early-day",
      depletionFractionMode: "adjust-for-etc",
      unknownFluxPolicy: "assume-zero-and-report",
    });

    const result = aggregateHistoricalWaterAssessment([
      { plan: historicalPlan, engineResult, incompleteReasonCodes: [] },
    ]);

    expect(result.status).toBe("insufficient-data");
    expect(result.seasons[0]?.incompleteReasonCodes).toContain("MISSING_WEATHER_DAY");
  });

  it.each([
    ["precipitation", "precipitationMm"],
    ["ET0", "referenceEvapotranspirationMm"],
  ] as const)("does not treat missing %s as zero", (_label, missingField) => {
    const historicalPlan = plan(2024);
    const dailyWeather = weather(historicalPlan.periodStartDate, 25, 0);
    const dayWithMissingValue = dailyWeather[5];
    if (!dayWithMissingValue) throw new Error("Expected test weather day.");
    dailyWeather[5] = { ...dayWithMissingValue, [missingField]: null };
    const engineResult = simulateFao56Season({
      cropProfileId: "potato",
      analysisDate: historicalPlan.analysisDate,
      dailyWeather,
      soilLayers,
      phenologyScenarios: historicalPlan.phenologyScenarios,
      wettingTiming: "early-day",
      depletionFractionMode: "adjust-for-etc",
      unknownFluxPolicy: "assume-zero-and-report",
    });

    const result = aggregateHistoricalWaterAssessment([
      { plan: historicalPlan, engineResult, incompleteReasonCodes: [] },
    ]);

    expect(result.status).toBe("insufficient-data");
    expect(result.seasons[0]?.incompleteReasonCodes).toContain("MISSING_WEATHER_VALUE");
  });

  it("propagates a partial SoilGrids water profile into incomplete scenarios", () => {
    const historicalPlan = plan(2024);
    const partialSoil = soilLayers.map((layer, index) =>
      index === 3 ? { ...layer, fieldCapacity33KpaVolumetricFraction: null } : layer,
    );
    const engineResult = simulateFao56Season({
      cropProfileId: "potato",
      analysisDate: historicalPlan.analysisDate,
      dailyWeather: weather(historicalPlan.periodStartDate, 25, 0),
      soilLayers: partialSoil,
      phenologyScenarios: historicalPlan.phenologyScenarios,
      wettingTiming: "early-day",
      depletionFractionMode: "adjust-for-etc",
      unknownFluxPolicy: "assume-zero-and-report",
    });

    const result = aggregateHistoricalWaterAssessment([
      {
        plan: historicalPlan,
        engineResult,
        incompleteReasonCodes: ["SOIL_PROFILE_INCOMPLETE"],
      },
    ]);

    expect(result.status).toBe("insufficient-data");
    expect(result.seasons[0]?.incompleteReasonCodes).toEqual(
      expect.arrayContaining(["MISSING_SOIL_VALUE", "SOIL_PROFILE_INCOMPLETE"]),
    );
  });

  it("is stable regardless of input year ordering", () => {
    const ordered = [simulation(2024, 0), simulation(2023, 12), simulation(2022, 0)];

    expect(aggregateHistoricalWaterAssessment([...ordered].reverse())).toEqual(
      aggregateHistoricalWaterAssessment(ordered),
    );
  });
});
