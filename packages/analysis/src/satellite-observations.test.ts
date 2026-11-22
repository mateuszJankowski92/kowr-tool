import { describe, expect, it } from "vitest";
import {
  calculateSatelliteObservationTrend,
  SATELLITE_LOOKBACK_DAYS,
  type SatelliteObservationForSelection,
  selectSatelliteObservation,
  subtractCalendarDays,
} from "./satellite-observations.js";

function observation(
  date: string,
  quality: "sufficient" | "limited" | "insufficient",
  median: number | null = 0.3,
): SatelliteObservationForSelection {
  return {
    date,
    indicators: {
      ndmi: { median, quality },
      ndvi: { median, quality },
    },
  };
}

describe("satellite observation selection", () => {
  it("selects the closest earlier sufficient observation and its previous trend point", () => {
    const observations = [
      observation("2026-05-03", "sufficient"),
      observation("2026-05-08", "limited"),
      observation("2026-05-13", "sufficient"),
      observation("2026-05-18", "sufficient"),
    ];

    expect(selectSatelliteObservation(observations, "2026-05-15")).toEqual({
      previousUsefulIndex: 0,
      reason: null,
      selectedIndex: 2,
      status: "available",
    });
  });

  it("never selects a future observation", () => {
    const observations = [
      observation("2026-05-13", "sufficient"),
      observation("2026-05-16", "sufficient"),
    ];

    expect(selectSatelliteObservation(observations, "2026-05-15").selectedIndex).toBe(0);
  });

  it("returns a limited result when only partial-coverage observations have both values", () => {
    expect(
      selectSatelliteObservation([observation("2026-05-10", "limited")], "2026-05-15"),
    ).toMatchObject({ reason: "partial-coverage", selectedIndex: 0, status: "limited" });
  });

  it("keeps the latest low-quality observation from displacing an older useful one", () => {
    const observations = [
      observation("2026-05-10", "sufficient"),
      observation("2026-05-14", "limited"),
    ];

    expect(selectSatelliteObservation(observations, "2026-05-15")).toMatchObject({
      selectedIndex: 0,
      status: "available",
    });
  });

  it("returns limited data when only one indicator has a value", () => {
    const partial = observation("2026-05-10", "limited");
    partial.indicators.ndmi.median = null;

    expect(selectSatelliteObservation([partial], "2026-05-15")).toMatchObject({
      reason: "partial-coverage",
      selectedIndex: 0,
      status: "limited",
    });
  });

  it("does not use observations older than the 60-day window", () => {
    const analysisDate = "2026-05-15";
    const tooOld = subtractCalendarDays(analysisDate, SATELLITE_LOOKBACK_DAYS + 1);

    expect(
      selectSatelliteObservation([observation(tooOld, "sufficient")], analysisDate),
    ).toMatchObject({ reason: "no-observations", status: "unavailable" });
  });

  it("reports unavailable data when observations contain no index values", () => {
    expect(
      selectSatelliteObservation([observation("2026-05-10", "insufficient", null)], "2026-05-15"),
    ).toMatchObject({ reason: "no-index-values", selectedIndex: null, status: "unavailable" });
  });

  it("uses sufficient NDMI even when NDVI is unavailable", () => {
    const ndmiOnly = observation("2026-05-10", "sufficient");
    ndmiOnly.indicators.ndvi.median = null;
    ndmiOnly.indicators.ndvi.quality = null;

    expect(selectSatelliteObservation([ndmiOnly], "2026-05-15")).toMatchObject({
      selectedIndex: 0,
      status: "available",
    });
  });
});

describe("satellite observation trend", () => {
  it("does not infer a trend from fewer than four observations", () => {
    const cases: SatelliteObservationForSelection[][] = [
      [],
      [observation("2026-05-01", "sufficient", 0.1)],
      [observation("2026-05-01", "sufficient", 0.1), observation("2026-05-06", "sufficient", 0.2)],
      [
        observation("2026-05-01", "sufficient", 0.1),
        observation("2026-05-06", "sufficient", 0.2),
        observation("2026-05-11", "sufficient", 0.3),
      ],
    ];

    for (const observations of cases) {
      expect(calculateSatelliteObservationTrend(observations, "2026-05-15")).toEqual({
        direction: "insufficient",
        method: "mann-kendall-theil-sen",
        observationCount: observations.length,
        pValue: null,
        slopePerDay: null,
      });
    }
  });

  it("detects a supported decrease from the full useful series", () => {
    const observations = [
      observation("2026-04-15", "sufficient", 0.55),
      observation("2026-04-20", "sufficient", 0.49),
      observation("2026-04-25", "sufficient", 0.42),
      observation("2026-05-01", "sufficient", 0.34),
      observation("2026-05-08", "sufficient", 0.26),
      observation("2026-05-13", "sufficient", 0.18),
    ];

    const result = calculateSatelliteObservationTrend(observations, "2026-05-15");

    expect(result.direction).toBe("decreasing");
    expect(result.observationCount).toBe(6);
    expect(result.pValue).toBeLessThanOrEqual(0.05);
    expect(result.slopePerDay).toBeLessThan(0);
  });

  it("does not call mixed observations a clear trend", () => {
    const observations = [
      observation("2026-04-15", "sufficient", 0.3),
      observation("2026-04-20", "sufficient", 0.36),
      observation("2026-04-25", "sufficient", 0.29),
      observation("2026-05-01", "sufficient", 0.35),
      observation("2026-05-08", "sufficient", 0.3),
      observation("2026-05-13", "sufficient", 0.34),
    ];

    expect(calculateSatelliteObservationTrend(observations, "2026-05-15").direction).toBe(
      "no-clear-change",
    );
  });

  it("excludes low-quality and future observations", () => {
    const observations = [
      observation("2026-04-20", "sufficient", 0.5),
      observation("2026-04-25", "sufficient", 0.4),
      observation("2026-05-01", "limited", 0.2),
      observation("2026-05-05", "sufficient", 0.3),
      observation("2026-05-10", "sufficient", 0.2),
      observation("2026-05-16", "sufficient", 0.1),
    ];

    const result = calculateSatelliteObservationTrend(observations, "2026-05-15");

    expect(result.observationCount).toBe(4);
    expect(result.direction).toBe("no-clear-change");
  });
});
