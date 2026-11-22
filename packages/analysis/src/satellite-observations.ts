export const SATELLITE_LOOKBACK_DAYS = 60;

type SatelliteQualityAssessment = "sufficient" | "limited" | "insufficient";

export type SatelliteObservationForSelection = {
  date: string;
  indicators: {
    ndmi: {
      median: number | null;
      quality: SatelliteQualityAssessment | null;
    };
    ndvi: {
      median: number | null;
      quality: SatelliteQualityAssessment | null;
    };
  };
};

export type SatelliteObservationSelection = {
  previousUsefulIndex: number | null;
  reason: "no-observations" | "no-index-values" | "partial-coverage" | null;
  selectedIndex: number | null;
  status: "available" | "limited" | "unavailable";
};

export type SatelliteObservationTrend = {
  direction: "decreasing" | "increasing" | "insufficient" | "no-clear-change";
  method: "mann-kendall-theil-sen";
  observationCount: number;
  pValue: number | null;
  slopePerDay: number | null;
};

const DAY_MS = 86_400_000;
const MIN_TREND_OBSERVATIONS = 4;
const TREND_SIGNIFICANCE_LEVEL = 0.05;

function parseCalendarDate(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

export function subtractCalendarDays(value: string, days: number): string {
  const date = new Date(parseCalendarDate(value) - days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  return Math.round((parseCalendarDate(later) - parseCalendarDate(earlier)) / DAY_MS);
}

function hasAnyValue(observation: SatelliteObservationForSelection): boolean {
  return observation.indicators.ndmi.median !== null || observation.indicators.ndvi.median !== null;
}

export function isUsefulSatelliteObservation(
  observation: SatelliteObservationForSelection,
): boolean {
  return (
    observation.indicators.ndmi.median !== null &&
    observation.indicators.ndmi.quality === "sufficient"
  );
}

function eligibleObservations(
  observations: SatelliteObservationForSelection[],
  analysisDate: string,
  maxLookbackDays: number,
) {
  const fromDate = subtractCalendarDays(analysisDate, maxLookbackDays);
  return observations
    .map((observation, index) => ({ index, observation }))
    .filter(({ observation }) => observation.date >= fromDate && observation.date <= analysisDate)
    .sort((left, right) => left.observation.date.localeCompare(right.observation.date));
}

export function selectSatelliteObservation(
  observations: SatelliteObservationForSelection[],
  analysisDate: string,
  maxLookbackDays = SATELLITE_LOOKBACK_DAYS,
): SatelliteObservationSelection {
  const eligible = eligibleObservations(observations, analysisDate, maxLookbackDays);

  if (eligible.length === 0) {
    return {
      previousUsefulIndex: null,
      reason: "no-observations",
      selectedIndex: null,
      status: "unavailable",
    };
  }

  const useful = eligible.filter(({ observation }) => isUsefulSatelliteObservation(observation));
  const selectedUseful = useful.at(-1);
  if (selectedUseful) {
    return {
      previousUsefulIndex: useful.at(-2)?.index ?? null,
      reason: null,
      selectedIndex: selectedUseful.index,
      status: "available",
    };
  }

  const withValues = eligible.filter(({ observation }) => hasAnyValue(observation));
  const selectedLimited = withValues.at(-1);
  if (selectedLimited) {
    return {
      previousUsefulIndex: null,
      reason: "partial-coverage",
      selectedIndex: selectedLimited.index,
      status: "limited",
    };
  }

  return {
    previousUsefulIndex: null,
    reason: "no-index-values",
    selectedIndex: null,
    status: "unavailable",
  };
}

function normalCdf(value: number): number {
  const absoluteValue = Math.abs(value);
  const factor = 1 / (1 + 0.231_641_9 * absoluteValue);
  const density = Math.exp(-(absoluteValue * absoluteValue) / 2) / Math.sqrt(2 * Math.PI);
  const approximation =
    1 -
    density *
      factor *
      (0.319_381_53 +
        factor *
          (-0.356_563_782 +
            factor * (1.781_477_937 + factor * (-1.821_255_978 + factor * 1.330_274_429))));
  return value >= 0 ? approximation : 1 - approximation;
}

function mannKendallPValue(values: number[]): number {
  let score = 0;
  for (let left = 0; left < values.length - 1; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      score += Math.sign((values[right] ?? 0) - (values[left] ?? 0));
    }
  }

  const tieCounts = new Map<number, number>();
  for (const value of values) tieCounts.set(value, (tieCounts.get(value) ?? 0) + 1);
  const tieCorrection = [...tieCounts.values()].reduce(
    (sum, count) => sum + count * (count - 1) * (2 * count + 5),
    0,
  );
  const sampleSize = values.length;
  const variance = (sampleSize * (sampleSize - 1) * (2 * sampleSize + 5) - tieCorrection) / 18;
  if (variance === 0) return 1;

  const correctedScore = score > 0 ? score - 1 : score < 0 ? score + 1 : 0;
  const zScore = correctedScore / Math.sqrt(variance);
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(zScore))));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function theilSenSlope(observations: { date: string; value: number }[]): number | null {
  const slopes: number[] = [];
  for (let left = 0; left < observations.length - 1; left += 1) {
    for (let right = left + 1; right < observations.length; right += 1) {
      const earlier = observations[left];
      const later = observations[right];
      if (!earlier || !later) continue;
      const elapsedDays = differenceInCalendarDays(later.date, earlier.date);
      if (elapsedDays > 0) slopes.push((later.value - earlier.value) / elapsedDays);
    }
  }
  return median(slopes);
}

export function calculateSatelliteObservationTrend(
  observations: SatelliteObservationForSelection[],
  analysisDate: string,
  maxLookbackDays = SATELLITE_LOOKBACK_DAYS,
): SatelliteObservationTrend {
  const useful = eligibleObservations(observations, analysisDate, maxLookbackDays)
    .map(({ observation }) => observation)
    .filter(isUsefulSatelliteObservation)
    .map((observation) => ({
      date: observation.date,
      value: observation.indicators.ndmi.median as number,
    }));

  if (useful.length < MIN_TREND_OBSERVATIONS) {
    return {
      direction: "insufficient",
      method: "mann-kendall-theil-sen",
      observationCount: useful.length,
      pValue: null,
      slopePerDay: null,
    };
  }

  const pValue = mannKendallPValue(useful.map(({ value }) => value));
  const slopePerDay = theilSenSlope(useful);
  const direction =
    pValue <= TREND_SIGNIFICANCE_LEVEL && slopePerDay !== null && slopePerDay !== 0
      ? slopePerDay > 0
        ? "increasing"
        : "decreasing"
      : "no-clear-change";

  return {
    direction,
    method: "mann-kendall-theil-sen",
    observationCount: useful.length,
    pValue,
    slopePerDay,
  };
}
