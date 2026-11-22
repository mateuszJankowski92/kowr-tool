import { describe, expect, it } from "vitest";
import {
  aggregatePrecipitationTimeline,
  calculateFao56ReferenceEvapotranspiration,
  comparePrecipitationTimeline,
  comparePrecipitationWithHistory,
  createComparableWeatherPeriods,
  resolveWeatherPeriod,
  selectPrecipitationAggregation,
  summarizeComparablePrecipitationPrefix,
  summarizeSolarRadiationPeriod,
  summarizeWeatherPeriod,
} from "./weather-conditions.js";

describe("weather conditions analysis", () => {
  it("uses the exact selected range and creates ten equal-length comparison periods", () => {
    const period = resolveWeatherPeriod({
      type: "range",
      startDate: "2024-05-10",
      endDate: "2024-06-08",
    });
    const periods = createComparableWeatherPeriods(period);

    expect(period.expectedDayCount).toBe(30);
    expect(periods).toHaveLength(10);
    expect(periods[1]).toMatchObject({ startDate: "2023-05-10", endDate: "2023-06-08" });
  });

  it("marks incomplete ET0 separately from a valid zero precipitation day", () => {
    const summary = summarizeWeatherPeriod(
      [
        { date: "2024-06-01", precipitationMm: 0, et0Mm: 3 },
        { date: "2024-06-02", precipitationMm: 4, et0Mm: null },
      ],
      2,
    );

    expect(summary.precipitationMm).toBe(4);
    expect(summary.precipitationComplete).toBe(true);
    expect(summary.et0Complete).toBe(false);
    expect(summary.differenceMm).toBeNull();
  });

  it("summarizes a continuous precipitation prefix when only trailing days are missing", () => {
    expect(
      summarizeComparablePrecipitationPrefix([
        { date: "2026-11-18", precipitationMm: 2, et0Mm: null },
        { date: "2026-11-19", precipitationMm: 0, et0Mm: null },
        { date: "2026-11-20", precipitationMm: null, et0Mm: null },
        { date: "2026-11-21", precipitationMm: null, et0Mm: null },
      ]),
    ).toEqual({ dayCount: 2, precipitationMm: 2 });
  });

  it("rejects a precipitation prefix when data resumes after an internal gap", () => {
    expect(
      summarizeComparablePrecipitationPrefix([
        { date: "2026-11-18", precipitationMm: 2, et0Mm: null },
        { date: "2026-11-19", precipitationMm: null, et0Mm: null },
        { date: "2026-11-20", precipitationMm: 1, et0Mm: null },
      ]),
    ).toBeNull();
  });

  it("calculates a plausible FAO-56 reference grass ET0", () => {
    const et0 = calculateFao56ReferenceEvapotranspiration({
      date: "2024-07-15",
      latitude: 52.4,
      elevationMeters: 90,
      temperatureMinCelsius: 15,
      temperatureMaxCelsius: 27,
      temperatureMeanCelsius: 21,
      dewPointCelsius: 12,
      windSpeed2MetersPerSecond: 2,
      surfacePressureKilopascals: 100.2,
      solarRadiationMegajoulesPerSquareMeter: 22,
    });

    expect(et0).toBeGreaterThan(3);
    expect(et0).toBeLessThan(7);
  });

  it("classifies precipitation with empirical historical quartiles", () => {
    expect(
      comparePrecipitationWithHistory({
        currentMm: 25,
        currentComplete: true,
        historicalValuesMm: [40, 50, 60, 70, 80, 90, 100, 110, 120],
        comparisonPeriodCount: 9,
      }),
    ).toMatchObject({
      classification: "lower",
      medianMm: 80,
      completePeriodCount: 9,
      comparisonPeriodCount: 9,
    });
  });

  it("withholds historical classification for partial current data or too few years", () => {
    expect(
      comparePrecipitationWithHistory({
        currentMm: 25,
        currentComplete: false,
        historicalValuesMm: [20, 30, 40, 50, 60, 70],
        comparisonPeriodCount: 9,
      }).classification,
    ).toBe("unavailable");
    expect(
      comparePrecipitationWithHistory({
        currentMm: 25,
        currentComplete: true,
        historicalValuesMm: [20, 30, 40, 50],
        comparisonPeriodCount: 9,
      }).classification,
    ).toBe("unavailable");
  });

  it("selects readable daily, weekly and monthly precipitation aggregation", () => {
    expect(selectPrecipitationAggregation(30)).toBe("daily");
    expect(selectPrecipitationAggregation(90)).toBe("weekly");
    expect(selectPrecipitationAggregation(365)).toBe("monthly");
  });

  it("aggregates complete weekly precipitation without turning a missing day into zero", () => {
    const days = Array.from({ length: 8 }, (_, index) => ({
      date: `2024-06-${String(index + 1).padStart(2, "0")}`,
      precipitationMm: index === 2 ? null : index === 7 ? 0 : 2,
    }));

    expect(aggregatePrecipitationTimeline(days, "weekly")).toEqual([
      {
        startDate: "2024-06-01",
        endDate: "2024-06-07",
        precipitationMm: null,
        availableDayCount: 6,
        expectedDayCount: 7,
        complete: false,
      },
      {
        startDate: "2024-06-08",
        endDate: "2024-06-08",
        precipitationMm: 0,
        availableDayCount: 1,
        expectedDayCount: 1,
        complete: true,
      },
    ]);
  });

  it("uses the actual day count for monthly buckets shared with the solar timeline", () => {
    const days = [
      { date: "2024-05-30", precipitationMm: 2 },
      { date: "2024-05-31", precipitationMm: 3 },
      { date: "2024-06-01", precipitationMm: 0 },
    ];
    expect(aggregatePrecipitationTimeline(days, "monthly")).toMatchObject([
      { expectedDayCount: 2, precipitationMm: 5, complete: true },
      { expectedDayCount: 1, precipitationMm: 0, complete: true },
    ]);
  });

  it("keeps leap-day ranges aligned by duration in historical comparisons", () => {
    const period = resolveWeatherPeriod({ type: "day", date: "2024-02-29" }, "7-days");
    const periods = createComparableWeatherPeriods(period, 2);

    expect(periods[0]).toMatchObject({ startDate: "2024-02-23", endDate: "2024-02-29" });
    expect(periods[1]).toMatchObject({ startDate: "2023-02-22", endDate: "2023-02-28" });
  });

  it("compares each precipitation bucket with the median of equal-length historical buckets", () => {
    const selectedDays = Array.from({ length: 15 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      precipitationMm: index < 7 ? 2 : index < 14 ? 4 : 3,
    }));
    const historicalSeries = Array.from({ length: 10 }, (_, index) => ({
      year: 2025 - index,
      days: Array.from({ length: 15 }, (_, dayIndex) => ({
        date: `${2025 - index}-09-${String(dayIndex + 1).padStart(2, "0")}`,
        precipitationMm: index + 1,
      })),
    }));

    const comparison = comparePrecipitationTimeline({
      selectedDays,
      historicalSeries,
      aggregation: "weekly",
    });

    expect(comparison.points).toHaveLength(3);
    expect(comparison.points[0]).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      precipitationMm: 14,
      historicalMedianMm: 38.5,
      differenceFromHistoricalMedianMm: -24.5,
      historicalCompletePeriodCount: 10,
      historicalComparisonPeriodCount: 10,
    });
    expect(comparison.points[2]).toMatchObject({
      startDate: "2026-09-15",
      endDate: "2026-09-15",
      expectedDayCount: 1,
      precipitationMm: 3,
      historicalMedianMm: 5.5,
    });
    expect(comparison.lowerThanHistoricalMedianCount).toBe(3);
    expect(comparison.comparablePointCount).toBe(3);
  });

  it("withholds a bucket median when fewer than five historical periods are complete", () => {
    const selectedDays = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-12-${String(index + 28).padStart(2, "0")}`,
      precipitationMm: 1,
    })).map((day, index) => ({
      ...day,
      date: new Date(Date.UTC(2026, 11, 28 + index)).toISOString().slice(0, 10),
    }));
    const historicalSeries = Array.from({ length: 10 }, (_, index) => ({
      year: 2025 - index,
      days: selectedDays.map((_, dayIndex) => ({
        date: new Date(Date.UTC(2025 - index, 11, 28 + dayIndex)).toISOString().slice(0, 10),
        precipitationMm: index < 4 ? 2 : dayIndex === 3 ? null : 2,
      })),
    }));

    const comparison = comparePrecipitationTimeline({
      selectedDays,
      historicalSeries,
      aggregation: "weekly",
    });

    expect(comparison.points[0]).toMatchObject({
      startDate: "2026-12-28",
      endDate: "2027-01-03",
      historicalMedianMm: null,
      differenceFromHistoricalMedianMm: null,
      historicalCompletePeriodCount: 4,
      historicalComparisonPeriodCount: 10,
    });
    expect(comparison.points[0]?.historicalPeriods[0]).toMatchObject({
      startDate: "2025-12-28",
      endDate: "2026-01-03",
      complete: true,
      expectedDayCount: 7,
    });
    expect(comparison.comparablePointCount).toBe(0);
  });

  it("keeps leap-day and missing current measurements explicit in bucket comparisons", () => {
    const selectedDays = [
      { date: "2024-02-28", precipitationMm: 1 },
      { date: "2024-02-29", precipitationMm: null },
      { date: "2024-03-01", precipitationMm: 1 },
    ];
    const historicalSeries = Array.from({ length: 5 }, (_, index) => ({
      year: 2023 - index,
      days: [
        { date: `${2023 - index}-02-27`, precipitationMm: 1 },
        { date: `${2023 - index}-02-28`, precipitationMm: 1 },
        { date: `${2023 - index}-03-01`, precipitationMm: 1 },
      ],
    }));

    const comparison = comparePrecipitationTimeline({
      selectedDays,
      historicalSeries,
      aggregation: "weekly",
    });

    expect(comparison.points[0]).toMatchObject({
      precipitationMm: null,
      complete: false,
      availableDayCount: 2,
      expectedDayCount: 3,
      historicalMedianMm: 3,
      differenceFromHistoricalMedianMm: null,
    });
    expect(comparison.comparablePointCount).toBe(0);
  });
});

describe("solar radiation period totals", () => {
  const days = [
    { date: "2026-06-01", solarRadiationMjPerM2: 0 },
    { date: "2026-06-02", solarRadiationMjPerM2: 18.75 },
    { date: "2026-06-03", solarRadiationMjPerM2: null },
  ];

  it("sums exactly the requested dates and preserves a real zero", () => {
    expect(summarizeSolarRadiationPeriod(days, "2026-06-01", "2026-06-02")).toEqual({
      solarRadiationMjPerM2: 18.75,
      solarRadiationAvailableDayCount: 2,
    });
    expect(
      summarizeSolarRadiationPeriod(days, "2026-06-01", "2026-06-01").solarRadiationMjPerM2,
    ).toBe(0);
  });

  it("withholds a total for null values or absent dates", () => {
    expect(summarizeSolarRadiationPeriod(days, "2026-06-01", "2026-06-04")).toEqual({
      solarRadiationMjPerM2: null,
      solarRadiationAvailableDayCount: 2,
    });
  });
});
