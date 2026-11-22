import type { WaterAssessmentResponse } from "@kowr/contracts";
import { completeWaterAssessment } from "./water-assessment.test-fixture";

type Scenario = WaterAssessmentResponse["scenarios"]["results"][number];

export function waterScenario(input: {
  id: string;
  initialCondition: Scenario["configuration"]["initialCondition"];
  fieldCapacity?: Scenario["configuration"]["fieldCapacity"];
  stressDays: number;
  stressOnFinalDay: boolean;
  incomplete?: boolean;
}): Scenario {
  return {
    id: input.id,
    status: input.incomplete ? "incomplete" : "complete",
    configuration: {
      phenologyScenarioId: "calendar-1",
      phenologyDescription: "Test reference calendar",
      seasonStartDate: "2025-03-25",
      phenologySource: "fao56-reference",
      stageDurations: {
        initialDays: 20,
        developmentDays: 30,
        midSeasonDays: 35,
        lateSeasonDays: 15,
      },
      fieldCapacity: input.fieldCapacity ?? "10-kpa",
      initialCondition: input.initialCondition,
      wettingTiming: "early-day",
      cropCoefficientInitial: 0.5,
      cropCoefficientMidSeason: 1.15,
      cropCoefficientLateSeason: 0.3,
      initialRootDepthMeters: 0.2,
      maximumRootDepthMeters: 0.7,
    },
    issues: input.incomplete ? [{ code: "MISSING_WEATHER_DAY", date: "2025-06-30" }] : [],
    summary: {
      simulatedDays: 98,
      stressDays: input.stressDays,
      longestStressEpisodeDays: input.stressDays,
      minimumWaterStressCoefficient: input.stressDays > 0 ? 0.5 : 1,
      finalWaterStressCoefficient: input.incomplete ? null : input.stressOnFinalDay ? 0.5 : 1,
      finalRootZoneDepletionMm: 20,
      cumulativePotentialCropEvapotranspirationMm: 150,
      cumulativeAdjustedCropEvapotranspirationMm: 150 - input.stressDays,
      cumulativeEvapotranspirationDeficitMm: input.stressDays,
      totalDeepPercolationMm: 0,
      maximumAbsoluteMassBalanceResidualMm: 0,
    },
    stressEpisodes:
      input.stressDays > 0
        ? [
            {
              startDate: "2025-03-25",
              endDate: input.stressOnFinalDay ? "2025-06-30" : "2025-06-29",
              durationDays: input.stressDays,
              minimumWaterStressCoefficient: 0.5,
              potentialCropEvapotranspirationMm: 50,
              adjustedCropEvapotranspirationMm: 25,
              evapotranspirationDeficitMm: 25,
            },
          ]
        : [],
  };
}

export const assumptionDependentAssessment: WaterAssessmentResponse = {
  ...completeWaterAssessment,
  status: "indeterminate",
  assessmentLevel: "assumption-dependent",
  availableScenarioConclusion: "scenario-disagreement",
  balance: {
    classification: "indeterminate",
    scenarioConsensus: "scenario-disagreement",
    reason: "core-scenarios-disagree",
  },
  reasonCodes: ["SCENARIO_CONCLUSIONS_DISAGREE"],
  scenarios: {
    ...completeWaterAssessment.scenarios,
    totalCount: 4,
    completeCount: 4,
    stressDays: { minimum: 14, maximum: 97 },
    results: [
      waterScenario({
        id: "wet-10",
        initialCondition: "field-capacity",
        stressDays: 14,
        stressOnFinalDay: false,
      }),
      waterScenario({
        id: "wet-33",
        initialCondition: "field-capacity",
        fieldCapacity: "33-kpa",
        stressDays: 32,
        stressOnFinalDay: true,
      }),
      waterScenario({
        id: "dry-10",
        initialCondition: "wilting-point",
        stressDays: 80,
        stressOnFinalDay: true,
      }),
      waterScenario({
        id: "dry-33",
        initialCondition: "wilting-point",
        fieldCapacity: "33-kpa",
        stressDays: 97,
        stressOnFinalDay: true,
      }),
    ],
  },
};
