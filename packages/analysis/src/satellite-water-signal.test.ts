import { describe, expect, it } from "vitest";
import { interpretSatelliteWaterSignal } from "./satellite-water-signal.js";

const phenology = [
  {
    seasonStartDate: "2026-03-01",
    durations: { initialDays: 20, developmentDays: 30, midSeasonDays: 50, lateSeasonDays: 30 },
  },
];

describe("interpretSatelliteWaterSignal", () => {
  it("qualifies a fresh decreasing NDMI trend contained in mid-season", () => {
    expect(
      interpretSatelliteWaterSignal({
        analysisDate: "2026-05-20",
        historyDates: ["2026-04-22", "2026-05-01", "2026-05-10", "2026-05-18"],
        observationDate: "2026-05-18",
        phenologyScenarios: phenology,
        status: "available",
        trend: { direction: "decreasing", observationCount: 4, pValue: 0.03 },
      }),
    ).toEqual({
      signal: "pattern-compatible-with-shortage",
      reason: "decreasing-mid-season-ndmi",
    });
  });

  it("does not qualify a trend that spans a non-comparable growth stage", () => {
    expect(
      interpretSatelliteWaterSignal({
        analysisDate: "2026-05-20",
        historyDates: ["2026-03-10", "2026-04-10", "2026-05-10", "2026-05-18"],
        observationDate: "2026-05-18",
        phenologyScenarios: phenology,
        status: "available",
        trend: { direction: "decreasing", observationCount: 4, pValue: 0.03 },
      }),
    ).toEqual({ signal: "not-qualified", reason: "outside-comparable-growth-stage" });
  });

  it("does not qualify an old observation", () => {
    expect(
      interpretSatelliteWaterSignal({
        analysisDate: "2026-06-20",
        historyDates: ["2026-04-22", "2026-05-01", "2026-05-10", "2026-05-18"],
        observationDate: "2026-05-18",
        phenologyScenarios: phenology,
        status: "available",
        trend: { direction: "decreasing", observationCount: 4, pValue: 0.03 },
      }),
    ).toEqual({ signal: "not-qualified", reason: "observation-too-old" });
  });
});
