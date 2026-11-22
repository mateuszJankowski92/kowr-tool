import type { SatelliteSignal } from "./water-situation-assessment.js";

const DAY_MS = 86_400_000;
const MAX_OBSERVATION_AGE_DAYS = 14;

export type SatelliteWaterSignalReason =
  | "provider-unavailable"
  | "limited-observation-quality"
  | "observation-too-old"
  | "phenology-unavailable"
  | "outside-comparable-growth-stage"
  | "insufficient-trend"
  | "no-clear-trend"
  | "decreasing-mid-season-ndmi"
  | "increasing-mid-season-ndmi";

export type SatellitePhenologyScenario = {
  seasonStartDate: string;
  durations: {
    initialDays: number;
    developmentDays: number;
    midSeasonDays: number;
    lateSeasonDays: number;
  };
};

export type SatelliteWaterSignalResult = {
  signal: SatelliteSignal;
  reason: SatelliteWaterSignalReason;
};

function parseDate(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function addDays(value: string, days: number): string {
  return new Date(parseDate(value) + days * DAY_MS).toISOString().slice(0, 10);
}

function differenceInDays(later: string, earlier: string): number {
  return Math.round((parseDate(later) - parseDate(earlier)) / DAY_MS);
}

function isWithinMidSeason(date: string, scenario: SatellitePhenologyScenario): boolean {
  const midSeasonStart = addDays(
    scenario.seasonStartDate,
    scenario.durations.initialDays + scenario.durations.developmentDays,
  );
  const midSeasonEnd = addDays(midSeasonStart, scenario.durations.midSeasonDays - 1);
  return date >= midSeasonStart && date <= midSeasonEnd;
}

export function interpretSatelliteWaterSignal(input: {
  analysisDate: string;
  historyDates: readonly string[];
  observationDate: string | null;
  phenologyScenarios: readonly SatellitePhenologyScenario[];
  status: "available" | "limited" | "unavailable";
  trend: {
    direction: "decreasing" | "increasing" | "insufficient" | "no-clear-change";
    observationCount: number;
    pValue: number | null;
  };
}): SatelliteWaterSignalResult {
  if (input.status === "unavailable" || input.observationDate === null) {
    return { signal: "unavailable", reason: "provider-unavailable" };
  }
  if (input.status === "limited") {
    return { signal: "not-qualified", reason: "limited-observation-quality" };
  }
  if (differenceInDays(input.analysisDate, input.observationDate) > MAX_OBSERVATION_AGE_DAYS) {
    return { signal: "not-qualified", reason: "observation-too-old" };
  }
  if (input.phenologyScenarios.length === 0) {
    return { signal: "not-qualified", reason: "phenology-unavailable" };
  }
  if (
    input.trend.observationCount < 4 ||
    input.trend.direction === "insufficient" ||
    input.trend.pValue === null
  ) {
    return { signal: "not-qualified", reason: "insufficient-trend" };
  }
  const allDatesComparable =
    input.historyDates.length >= input.trend.observationCount &&
    input.historyDates.every((date) =>
      input.phenologyScenarios.every((scenario) => isWithinMidSeason(date, scenario)),
    );
  if (!allDatesComparable) {
    return { signal: "not-qualified", reason: "outside-comparable-growth-stage" };
  }
  if (input.trend.direction === "no-clear-change") {
    return { signal: "neutral", reason: "no-clear-trend" };
  }
  return input.trend.direction === "decreasing"
    ? { signal: "pattern-compatible-with-shortage", reason: "decreasing-mid-season-ndmi" }
    : { signal: "pattern-incompatible-with-shortage", reason: "increasing-mid-season-ndmi" };
}
