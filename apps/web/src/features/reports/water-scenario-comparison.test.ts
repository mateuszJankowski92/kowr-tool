import { describe, expect, it } from "vitest";
import { compareWaterScenarios } from "./water-scenario-comparison";
import {
  assumptionDependentAssessment,
  waterScenario,
} from "./water-scenario-comparison.test-fixture";

describe("water scenario comparison", () => {
  it("separates wet and dry start ranges instead of repeating the ensemble spread", () => {
    const comparison = compareWaterScenarios(assumptionDependentAssessment);
    expect(comparison.find(({ id }) => id === "initial-water")?.variants).toMatchObject([
      {
        completeCount: 2,
        stressDays: { minimum: 14, maximum: 32 },
        finalDay: { withStress: 1, withoutStress: 1, unavailable: 0 },
      },
      {
        completeCount: 2,
        stressDays: { minimum: 80, maximum: 97 },
        finalDay: { withStress: 2, withoutStress: 0, unavailable: 0 },
      },
    ]);
    expect(comparison.map(({ id }) => id)).toEqual(["initial-water", "field-capacity"]);
  });

  it("excludes incomplete simulations and never turns their absence into zero stress", () => {
    const result = {
      ...assumptionDependentAssessment,
      scenarios: {
        ...assumptionDependentAssessment.scenarios,
        results: [
          waterScenario({
            id: "wet",
            initialCondition: "field-capacity",
            stressDays: 14,
            stressOnFinalDay: false,
          }),
          waterScenario({
            id: "dry",
            initialCondition: "wilting-point",
            stressDays: 97,
            stressOnFinalDay: true,
            incomplete: true,
          }),
        ],
      },
    };
    expect(compareWaterScenarios(result)[0]?.variants).toMatchObject([
      { completeCount: 1, stressDays: { minimum: 14, maximum: 14 } },
      { totalCount: 1, completeCount: 0, stressDays: null, finalDay: { unavailable: 1 } },
    ]);
  });

  it("uses engine stress episodes rather than a new coefficient threshold in the browser", () => {
    const results = structuredClone(assumptionDependentAssessment.scenarios.results);
    const first = results[0];
    if (!first) throw new Error("Missing fixture scenario");
    first.summary.finalWaterStressCoefficient = 0.9999999999;
    expect(
      compareWaterScenarios({
        ...assumptionDependentAssessment,
        scenarios: { ...assumptionDependentAssessment.scenarios, results },
      })[0]?.variants[0]?.finalDay.withoutStress,
    ).toBe(1);
  });

  it("distinguishes phase calendars with equal total durations", () => {
    const results = structuredClone(assumptionDependentAssessment.scenarios.results);
    const first = results[0];
    if (!first) throw new Error("Missing fixture scenario");
    first.configuration.stageDurations = {
      initialDays: 30,
      developmentDays: 20,
      midSeasonDays: 35,
      lateSeasonDays: 15,
    };
    const comparison = compareWaterScenarios({
      ...assumptionDependentAssessment,
      scenarios: { ...assumptionDependentAssessment.scenarios, results },
    });
    expect(
      comparison.find(({ id }) => id === "phenology")?.variants.map(({ label }) => label),
    ).toEqual([
      "Początek 25 mar 2025; fazy 30/20/35/15 dni",
      "Początek 25 mar 2025; fazy 20/30/35/15 dni",
    ]);
  });
});
