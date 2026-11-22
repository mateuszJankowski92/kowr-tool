import { describe, expect, it } from "vitest";
import { resolveCropAssessmentPeriod } from "./crop-assessment-period.js";
import type { Fao56PhenologyScenario } from "./fao56-season-engine.js";

function scenario(start: string, lateDays = 10): Fao56PhenologyScenario {
  return {
    id: start,
    seasonStartDate: start,
    initialRootDepthMeters: 0.2,
    source: "user-supplied",
    description: "Test calendar",
    durations: {
      initialDays: 10,
      developmentDays: 10,
      midSeasonDays: 10,
      lateSeasonDays: lateDays,
    },
  };
}

describe("crop assessment period", () => {
  it("retains the requested date inside the season, including its final day", () => {
    expect(resolveCropAssessmentPeriod("2024-03-11", [scenario("2024-02-01")])).toEqual({
      scope: "analysis-day",
      evaluatedThroughDate: "2024-03-11",
    });
  });

  it("uses the last common modelled day only after every season has ended", () => {
    expect(
      resolveCropAssessmentPeriod("2024-11-21", [
        scenario("2024-02-01"),
        scenario("2024-02-01", 20),
      ]),
    ).toEqual({ scope: "completed-season", evaluatedThroughDate: "2024-03-11" });
  });

  it("does not discard an ended alternative while another is still active", () => {
    expect(
      resolveCropAssessmentPeriod("2024-03-15", [
        scenario("2024-02-01"),
        scenario("2024-02-01", 20),
      ]).scope,
    ).toBe("analysis-day");
  });

  it("does not move future, disjoint or unavailable seasons to a fabricated period", () => {
    for (const scenarios of [
      [],
      [scenario("2025-04-01")],
      [scenario("2024-02-01"), scenario("2024-08-01")],
    ]) {
      expect(resolveCropAssessmentPeriod("2024-11-21", scenarios).scope).toBe("analysis-day");
    }
  });
});
