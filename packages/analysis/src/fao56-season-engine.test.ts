import { describe, expect, it } from "vitest";
import { CROP_WATER_PROFILES } from "./crop-water-profiles.js";
import {
  buildReferencePhenologyScenarios,
  calculateLayeredTotalAvailableWaterMm,
  type Fao56DailyWeather,
  type Fao56PhenologyScenario,
  type Fao56SeasonEngineInput,
  type Fao56SoilLayer,
  simulateFao56Season,
} from "./fao56-season-engine.js";

const DAY_MILLISECONDS = 86_400_000;

const soilLayers: readonly Fao56SoilLayer[] = [
  {
    topDepthMeters: 0,
    bottomDepthMeters: 0.5,
    fieldCapacity10KpaVolumetricFraction: 0.35,
    fieldCapacity33KpaVolumetricFraction: 0.3,
    wiltingPointVolumetricFraction: 0.1,
  },
  {
    topDepthMeters: 0.5,
    bottomDepthMeters: 2,
    fieldCapacity10KpaVolumetricFraction: 0.32,
    fieldCapacity33KpaVolumetricFraction: 0.27,
    wiltingPointVolumetricFraction: 0.12,
  },
];

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

function weatherSeries(input: {
  startDate: string;
  days: number;
  precipitationMm?: (dayIndex: number) => number | null;
  referenceEvapotranspirationMm?: (dayIndex: number) => number | null;
  unknownFluxes?: boolean;
}): Fao56DailyWeather[] {
  return Array.from({ length: input.days }, (_, dayIndex) => {
    const precipitationMm = input.precipitationMm ? input.precipitationMm(dayIndex) : 0;
    const referenceEvapotranspirationMm = input.referenceEvapotranspirationMm
      ? input.referenceEvapotranspirationMm(dayIndex)
      : 4;
    return {
      date: addDays(input.startDate, dayIndex),
      precipitationMm,
      referenceEvapotranspirationMm,
      runoffMm: input.unknownFluxes ? null : 0,
      irrigationMm: input.unknownFluxes ? null : 0,
      capillaryRiseMm: input.unknownFluxes ? null : 0,
    };
  });
}

function phenology(input: {
  id?: string;
  startDate: string;
  durations?: {
    initialDays: number;
    developmentDays: number;
    midSeasonDays: number;
    lateSeasonDays: number;
  };
  initialRootDepthMeters?: number;
  source?: Fao56PhenologyScenario["source"];
}): Fao56PhenologyScenario {
  return {
    id: input.id ?? "phenology",
    seasonStartDate: input.startDate,
    durations: input.durations ?? {
      initialDays: 5,
      developmentDays: 5,
      midSeasonDays: 5,
      lateSeasonDays: 5,
    },
    initialRootDepthMeters: input.initialRootDepthMeters ?? 0.2,
    source: input.source ?? "user-supplied",
    description: "Test phenology",
  };
}

function engineInput(overrides: Partial<Fao56SeasonEngineInput> = {}): Fao56SeasonEngineInput {
  const startDate = "2025-04-01";
  return {
    cropProfileId: "spring-wheat",
    analysisDate: addDays(startDate, 19),
    dailyWeather: weatherSeries({ startDate, days: 20 }),
    soilLayers,
    phenologyScenarios: [phenology({ startDate })],
    wettingTiming: "early-day",
    depletionFractionMode: "table-value",
    unknownFluxPolicy: "require-values",
    ...overrides,
  };
}

describe("layered root-zone storage", () => {
  it("integrates partial SoilGrids layers in metres and millimetres", () => {
    expect(
      calculateLayeredTotalAvailableWaterMm({
        soilLayers,
        rootDepthMeters: 0.75,
        fieldCapacity: "33-kpa",
      }),
    ).toBeCloseTo(137.5);
    expect(
      calculateLayeredTotalAvailableWaterMm({
        soilLayers,
        rootDepthMeters: 0.75,
        fieldCapacity: "10-kpa",
      }),
    ).toBeCloseTo(175);
  });
});

describe("FAO-56 season engine", () => {
  it("simulates every day of a complete spring crop season", () => {
    const startDate = "2025-03-20";
    const [referencePhenology] = buildReferencePhenologyScenarios({
      cropProfileId: "spring-wheat",
      seasonStartDates: [startDate],
      initialRootDepthMeters: 0.2,
    });
    expect(referencePhenology).toBeDefined();
    if (!referencePhenology) return;
    const seasonDays = Object.values(referencePhenology.durations).reduce(
      (sum, days) => sum + days,
      0,
    );
    const result = simulateFao56Season(
      engineInput({
        analysisDate: addDays(startDate, seasonDays - 1),
        dailyWeather: weatherSeries({
          startDate,
          days: seasonDays,
          precipitationMm: (day) => (day % 9 === 0 ? 12 : 0),
        }),
        phenologyScenarios: [referencePhenology],
      }),
    );

    expect(result.spread.incompleteScenarioCount).toBe(0);
    expect(result.scenarios.every(({ days }) => days.length === seasonDays)).toBe(true);
    expect(new Set(result.scenarios[0]?.days.map(({ growthStage }) => growthStage))).toEqual(
      new Set(["initial", "development", "mid-season", "late-season"]),
    );
    expect(result.limitations).toContain("PHENOLOGY_NOT_POLAND_CALIBRATED");
  });

  it("keeps positive Ks during a long dry stress episode and reports its duration", () => {
    const startDate = "2025-04-01";
    const days = 65;
    const result = simulateFao56Season(
      engineInput({
        cropProfileId: "potato",
        analysisDate: addDays(startDate, days - 1),
        dailyWeather: weatherSeries({
          startDate,
          days,
          referenceEvapotranspirationMm: () => 4,
        }),
        phenologyScenarios: [
          phenology({
            startDate,
            durations: {
              initialDays: 5,
              developmentDays: 10,
              midSeasonDays: 40,
              lateSeasonDays: 10,
            },
          }),
        ],
      }),
    );
    const wetStartScenario = result.scenarios.find(
      ({ configuration, status, summary }) =>
        configuration.fieldCapacity === "33-kpa" &&
        configuration.initialCondition === "field-capacity" &&
        status === "complete" &&
        summary.stressDays > 20 &&
        (summary.minimumWaterStressCoefficient ?? 0) > 0,
    );

    expect(wetStartScenario).toBeDefined();
    expect(wetStartScenario?.stressEpisodes.some(({ durationDays }) => durationDays > 20)).toBe(
      true,
    );
    expect(result.balanceAssessment.balanceClassification).toBe("elevated-shortage-risk");
    expect(result.initialConditionConvergence.pairsWithSameStressConclusion).toBe(
      result.initialConditionConvergence.evaluatedPairs,
    );
  });

  it("drains intense early rainfall and makes extreme initial states converge", () => {
    const startDate = "2025-05-01";
    const result = simulateFao56Season(
      engineInput({
        analysisDate: addDays(startDate, 4),
        dailyWeather: weatherSeries({
          startDate,
          days: 5,
          precipitationMm: (day) => (day === 1 ? 500 : 0),
        }),
        phenologyScenarios: [
          phenology({
            startDate,
            durations: {
              initialDays: 5,
              developmentDays: 1,
              midSeasonDays: 1,
              lateSeasonDays: 1,
            },
          }),
        ],
      }),
    );

    expect(result.scenarios.every(({ summary }) => summary.totalDeepPercolationMm > 0)).toBe(true);
    expect(result.initialConditionConvergence.pairsWithNumericallyConvergedState).toBe(
      result.initialConditionConvergence.evaluatedPairs,
    );
  });

  it("increases root depth and TAW through the development stage", () => {
    const result = simulateFao56Season(engineInput());
    const scenario = result.scenarios.find(
      ({ configuration }) =>
        configuration.fieldCapacity === "33-kpa" &&
        configuration.initialCondition === "wilting-point" &&
        configuration.maximumRootDepthMeters === 1,
    );
    expect(scenario).toBeDefined();
    const initialDay = scenario?.days[0];
    const endOfDevelopment = scenario?.days[9];
    expect(initialDay?.rootDepthMeters).toBe(0.2);
    expect(endOfDevelopment?.rootDepthMeters).toBe(1);
    expect(endOfDevelopment?.totalAvailableWaterMm).toBeGreaterThan(
      initialDay?.totalAvailableWaterMm ?? Number.POSITIVE_INFINITY,
    );
    expect(endOfDevelopment?.rootGrowthDepletionAdjustmentMm).toBeGreaterThan(0);
  });

  it("returns an indeterminate result when wet and dry starts disagree", () => {
    const startDate = "2025-04-01";
    const result = simulateFao56Season(
      engineInput({
        analysisDate: startDate,
        dailyWeather: weatherSeries({ startDate, days: 1 }),
        phenologyScenarios: [phenology({ startDate })],
      }),
    );

    expect(result.status).toBe("indeterminate");
    expect(result.balanceAssessment.scenarioConsensus).toBe("scenario-disagreement");
    expect(result.spread.finalWaterStressCoefficient).toEqual({ minimum: 0, maximum: 1 });
  });

  it("does not replace a missing meteorological day or value with zero", () => {
    const startDate = "2025-04-01";
    const missingDay = simulateFao56Season(
      engineInput({
        dailyWeather: weatherSeries({ startDate, days: 20 }).filter(
          ({ date }) => date !== "2025-04-08",
        ),
      }),
    );
    const missingValue = simulateFao56Season(
      engineInput({
        dailyWeather: weatherSeries({
          startDate,
          days: 20,
          precipitationMm: (day) => (day === 7 ? null : 0),
        }),
      }),
    );

    expect(missingDay.status).toBe("insufficient-data");
    expect(
      missingDay.scenarios.every(({ issues }) => issues[0]?.code === "MISSING_WEATHER_DAY"),
    ).toBe(true);
    expect(missingValue.status).toBe("insufficient-data");
    expect(
      missingValue.scenarios.every(({ issues }) => issues[0]?.code === "MISSING_WEATHER_VALUE"),
    ).toBe(true);
  });

  it("preserves mass and physical depletion bounds in every scenario and day", () => {
    const result = simulateFao56Season(
      engineInput({
        dailyWeather: weatherSeries({
          startDate: "2025-04-01",
          days: 20,
          precipitationMm: (day) => (day % 4 === 0 ? 35 : 0),
        }),
        wettingTiming: "unknown",
      }),
    );

    for (const scenario of result.scenarios) {
      for (const day of scenario.days) {
        expect(day.rootZoneDepletionAtEndMm).toBeGreaterThanOrEqual(0);
        expect(day.rootZoneDepletionAtEndMm).toBeLessThanOrEqual(day.totalAvailableWaterMm);
        expect(Math.abs(day.massBalanceResidualMm)).toBeLessThan(1e-8);
      }
    }
    expect(result.limitations).toContain("UNKNOWN_WETTING_TIME_BRACKETED");
  });

  it("keeps alternative sowing dates as separate phenology scenarios", () => {
    const earliestStart = "2025-03-20";
    const latestStart = "2025-04-03";
    const scenarios = buildReferencePhenologyScenarios({
      cropProfileId: "spring-wheat",
      seasonStartDates: [earliestStart, latestStart],
      initialRootDepthMeters: 0.2,
    });
    const analysisDate = "2025-05-15";
    const weatherDays =
      (Date.parse(`${analysisDate}T00:00:00.000Z`) - Date.parse(`${earliestStart}T00:00:00.000Z`)) /
        DAY_MILLISECONDS +
      1;
    const result = simulateFao56Season(
      engineInput({
        analysisDate,
        dailyWeather: weatherSeries({ startDate: earliestStart, days: weatherDays }),
        phenologyScenarios: scenarios,
      }),
    );

    expect(
      new Set(result.scenarios.map(({ configuration }) => configuration.seasonStartDate)),
    ).toEqual(new Set([earliestStart, latestStart]));
    expect(
      result.scenarios.every(
        ({ configuration }) => configuration.stageDurations.initialDays === 20,
      ),
    ).toBe(true);
  });

  it("brackets a material unknown rain time with distinct early and late daily states", () => {
    const startDate = "2025-04-01";
    const result = simulateFao56Season(
      engineInput({
        analysisDate: startDate,
        dailyWeather: weatherSeries({
          startDate,
          days: 1,
          precipitationMm: () => 20,
          referenceEvapotranspirationMm: () => 5,
        }),
        phenologyScenarios: [phenology({ startDate })],
        wettingTiming: "unknown",
      }),
    );
    const dryEarly = result.scenarios.find(
      ({ configuration }) =>
        configuration.initialCondition === "wilting-point" &&
        configuration.fieldCapacity === "33-kpa" &&
        configuration.wettingTiming === "early-day",
    );
    const dryLate = result.scenarios.find(
      ({ configuration }) =>
        configuration.initialCondition === "wilting-point" &&
        configuration.fieldCapacity === "33-kpa" &&
        configuration.wettingTiming === "late-day",
    );

    expect(dryEarly?.days[0]?.waterStressCoefficient).toBeGreaterThan(0);
    expect(dryLate?.days[0]?.waterStressCoefficient).toBe(0);
    expect(dryEarly?.days[0]?.rootZoneDepletionAtEndMm).not.toBe(
      dryLate?.days[0]?.rootZoneDepletionAtEndMm,
    );
  });

  it("returns insufficient data for a missing required SoilGrids water value", () => {
    const [surfaceLayer, subsoilLayer] = soilLayers;
    expect(surfaceLayer).toBeDefined();
    expect(subsoilLayer).toBeDefined();
    if (!surfaceLayer || !subsoilLayer) return;
    const layersWithMissingValue: readonly Fao56SoilLayer[] = [
      { ...surfaceLayer, fieldCapacity33KpaVolumetricFraction: null },
      subsoilLayer,
    ];
    const result = simulateFao56Season(engineInput({ soilLayers: layersWithMissingValue }));

    expect(result.status).toBe("insufficient-data");
    expect(result.scenarios.some(({ issues }) => issues[0]?.code === "MISSING_SOIL_VALUE")).toBe(
      true,
    );
  });

  it("handles winter seasons across a calendar-year boundary", () => {
    const startDate = "2024-10-15";
    const days = 220;
    const result = simulateFao56Season(
      engineInput({
        cropProfileId: "winter-wheat",
        analysisDate: addDays(startDate, days - 1),
        dailyWeather: weatherSeries({
          startDate,
          days,
          precipitationMm: (day) => (day % 12 === 0 ? 10 : 0),
          referenceEvapotranspirationMm: (day) => (day < 100 ? 0.5 : 3),
        }),
        phenologyScenarios: [
          phenology({
            startDate,
            durations: {
              initialDays: 120,
              developmentDays: 40,
              midSeasonDays: 35,
              lateSeasonDays: 25,
            },
          }),
        ],
      }),
    );

    expect(result.spread.incompleteScenarioCount).toBe(0);
    expect(result.scenarios[0]?.days.at(-1)?.date.startsWith("2025-")).toBe(true);
  });

  it("runs all six crop profiles with explicit phenology while preserving both capacities", () => {
    for (const cropProfileId of [
      "winter-wheat",
      "spring-wheat",
      "grain-maize",
      "potato",
      "sugar-beet",
      "rapeseed",
    ] as const) {
      const startDate =
        cropProfileId === "winter-wheat" || cropProfileId === "rapeseed"
          ? "2024-10-01"
          : "2025-04-01";
      const result = simulateFao56Season(
        engineInput({
          cropProfileId,
          analysisDate: addDays(startDate, 3),
          dailyWeather: weatherSeries({ startDate, days: 4 }),
          phenologyScenarios: [
            phenology({
              startDate,
              durations: {
                initialDays: 1,
                developmentDays: 1,
                midSeasonDays: 1,
                lateSeasonDays: 1,
              },
            }),
          ],
        }),
      );

      expect(
        result.scenarios.some(({ configuration }) => configuration.fieldCapacity === "10-kpa"),
      ).toBe(true);
      expect(
        result.scenarios.some(({ configuration }) => configuration.fieldCapacity === "33-kpa"),
      ).toBe(true);
      expect(result.spread.completeScenarioCount).toBeGreaterThan(0);
    }
  });

  it("reports assumed unknown fluxes and refuses them under strict policy", () => {
    const startDate = "2025-04-01";
    const dailyWeather = weatherSeries({ startDate, days: 20, unknownFluxes: true });
    const conditional = simulateFao56Season(
      engineInput({ dailyWeather, unknownFluxPolicy: "assume-zero-and-report" }),
    );
    const strict = simulateFao56Season(
      engineInput({ dailyWeather, unknownFluxPolicy: "require-values" }),
    );

    expect(conditional.limitations).toContain("UNKNOWN_FLUXES_ASSUMED_ZERO");
    expect(conditional.spread.completeScenarioCount).toBeGreaterThan(0);
    expect(strict.status).toBe("insufficient-data");
  });

  it("uses adapted rapeseed references while still rejecting an empty scenario set", () => {
    const scenarios = buildReferencePhenologyScenarios({
      cropProfileId: "rapeseed",
      seasonStartDates: ["2024-09-01"],
      initialRootDepthMeters: 0.2,
    });
    expect(scenarios).toHaveLength(2);
    expect(scenarios.every(({ source }) => source === "project-adapted-reference")).toBe(true);
    const result = simulateFao56Season(
      engineInput({
        cropProfileId: "rapeseed",
        phenologyScenarios: [],
      }),
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.scenarios).toEqual([]);
  });
});

describe("established perennial root systems", () => {
  it("retains mature orchard rooting depth throughout seasonal canopy growth", () => {
    const result = simulateFao56Season(engineInput({ cropProfileId: "pome-orchard" }));
    expect(result.scenarios.length).toBeGreaterThan(0);
    for (const scenario of result.scenarios) {
      expect(scenario.status).toBe("complete");
      expect(scenario.configuration.initialRootDepthMeters).toBe(
        scenario.configuration.maximumRootDepthMeters,
      );
      expect(new Set(scenario.days.map((day) => day.rootDepthMeters))).toEqual(
        new Set([scenario.configuration.maximumRootDepthMeters]),
      );
      expect(scenario.summary.maximumAbsoluteMassBalanceResidualMm).toBeLessThan(1e-8);
    }
  });
});

describe("supported crop reference ensemble", () => {
  it.each(CROP_WATER_PROFILES.map(({ id }) => id))(
    "computes every required variant for %s with complete inputs",
    (cropProfileId) => {
      const result = simulateFao56Season(
        engineInput({
          cropProfileId,
          analysisDate: "2025-04-15",
          dailyWeather: weatherSeries({
            startDate: "2025-04-01",
            days: 15,
            precipitationMm: (day) => (day % 3 === 0 ? 8 : 0),
          }),
          phenologyScenarios: buildReferencePhenologyScenarios({
            cropProfileId,
            seasonStartDates: ["2025-04-01"],
            initialRootDepthMeters: 0.2,
          }),
        }),
      );
      expect(result.scenarios.length).toBeGreaterThan(0);
      for (const scenario of result.scenarios) {
        expect(scenario.status).toBe("complete");
        expect(scenario.summary.simulatedDays).toBe(15);
        expect(scenario.summary.maximumAbsoluteMassBalanceResidualMm).toBeLessThan(1e-8);
      }
    },
  );
});
