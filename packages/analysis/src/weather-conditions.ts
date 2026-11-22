const DAY_MS = 86_400_000;

export type AnalysisDateSelection =
  | { type: "day"; date: string }
  | { type: "range"; startDate: string; endDate: string };

export type WeatherPeriodPreset = "7-days" | "30-days" | "90-days" | "season";

export type WeatherPeriod = {
  startDate: string;
  endDate: string;
  expectedDayCount: number;
  label: string;
};

export type WeatherMeasurement = {
  date: string;
  precipitationMm: number | null;
  et0Mm: number | null;
};

export type PrecipitationAggregation = "daily" | "weekly" | "monthly";

export type PrecipitationTimelinePoint = {
  startDate: string;
  endDate: string;
  precipitationMm: number | null;
  availableDayCount: number;
  expectedDayCount: number;
  complete: boolean;
};

export type HistoricalPrecipitationTimelinePoint = PrecipitationTimelinePoint & {
  year: number;
};

export type PrecipitationTimelineComparisonPoint = PrecipitationTimelinePoint & {
  historicalMedianMm: number | null;
  differenceFromHistoricalMedianMm: number | null;
  historicalCompletePeriodCount: number;
  historicalComparisonPeriodCount: number;
  historicalPeriods: HistoricalPrecipitationTimelinePoint[];
};

export type PrecipitationTimelineComparison = {
  points: PrecipitationTimelineComparisonPoint[];
  lowerThanHistoricalMedianCount: number;
  comparablePointCount: number;
  totalPointCount: number;
};

export type PrecipitationComparison = {
  classification: "lower" | "typical" | "higher" | "unavailable";
  medianMm: number | null;
  q25Mm: number | null;
  q75Mm: number | null;
  completePeriodCount: number;
  comparisonPeriodCount: number;
};

export type ComparablePrecipitationPrefix = {
  dayCount: number;
  precipitationMm: number;
};

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function countDays(startDate: string, endDate: string): number {
  return Math.round((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / DAY_MS) + 1;
}

function seasonStart(endDate: string): string {
  const date = parseDate(endDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  if (month >= 3 && month <= 5) return `${year}-03-01`;
  if (month >= 6 && month <= 8) return `${year}-06-01`;
  if (month >= 9 && month <= 11) return `${year}-09-01`;
  return month === 12 ? `${year}-12-01` : `${year - 1}-12-01`;
}

export function resolveWeatherPeriod(
  selection: AnalysisDateSelection,
  preset: WeatherPeriodPreset = "30-days",
): WeatherPeriod {
  if (selection.type === "range") {
    return {
      startDate: selection.startDate,
      endDate: selection.endDate,
      expectedDayCount: countDays(selection.startDate, selection.endDate),
      label: "Wybrany zakres",
    };
  }

  const presetDays = preset === "7-days" ? 7 : preset === "90-days" ? 90 : 30;
  const startDate =
    preset === "season" ? seasonStart(selection.date) : shiftDays(selection.date, 1 - presetDays);

  return {
    startDate,
    endDate: selection.date,
    expectedDayCount: countDays(startDate, selection.date),
    label: preset === "season" ? "Bieżący sezon meteorologiczny" : `Ostatnie ${presetDays} dni`,
  };
}

function shiftYearClamped(value: string, years: number): string {
  const date = parseDate(value);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear() + years, month, day));
  if (shifted.getUTCMonth() !== month) shifted.setUTCDate(0);
  return formatDate(shifted);
}

export function createComparableWeatherPeriods(
  period: WeatherPeriod,
  periodCount = 10,
): WeatherPeriod[] {
  return Array.from({ length: periodCount }, (_, index) => {
    const endDate = shiftYearClamped(period.endDate, -index);
    const startDate = shiftDays(endDate, 1 - period.expectedDayCount);
    return {
      startDate,
      endDate,
      expectedDayCount: period.expectedDayCount,
      label: period.label,
    };
  });
}

export function summarizeWeatherPeriod(
  days: readonly WeatherMeasurement[],
  expectedDayCount: number,
) {
  const precipitation = days.flatMap(({ precipitationMm }) =>
    precipitationMm === null ? [] : [precipitationMm],
  );
  const et0 = days.flatMap(({ et0Mm }) => (et0Mm === null ? [] : [et0Mm]));
  const precipitationMm = precipitation.length
    ? precipitation.reduce((total, value) => total + value, 0)
    : null;
  const et0Mm = et0.length ? et0.reduce((total, value) => total + value, 0) : null;
  const precipitationComplete = precipitation.length === expectedDayCount;
  const et0Complete = et0.length === expectedDayCount;

  return {
    precipitationMm,
    et0Mm,
    differenceMm:
      precipitationComplete && et0Complete && precipitationMm !== null && et0Mm !== null
        ? precipitationMm - et0Mm
        : null,
    precipitationAvailableDayCount: precipitation.length,
    et0AvailableDayCount: et0.length,
    expectedDayCount,
    precipitationComplete,
    et0Complete,
  };
}

export function summarizeComparablePrecipitationPrefix(
  days: readonly WeatherMeasurement[],
): ComparablePrecipitationPrefix | null {
  let dayCount = 0;
  let precipitationMm = 0;
  let reachedMissingDay = false;

  for (const day of days) {
    if (day.precipitationMm === null) {
      reachedMissingDay = true;
      continue;
    }
    if (reachedMissingDay) return null;
    dayCount += 1;
    precipitationMm += day.precipitationMm;
  }

  return dayCount > 0 ? { dayCount, precipitationMm } : null;
}

export function calculateQuantile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) return null;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function comparePrecipitationWithHistory(input: {
  currentMm: number | null;
  currentComplete: boolean;
  historicalValuesMm: readonly number[];
  comparisonPeriodCount: number;
  minimumCompletePeriods?: number;
}): PrecipitationComparison {
  const values = input.historicalValuesMm.filter((value) => Number.isFinite(value) && value >= 0);
  const medianMm = calculateQuantile(values, 0.5);
  const q25Mm = calculateQuantile(values, 0.25);
  const q75Mm = calculateQuantile(values, 0.75);
  const minimumCompletePeriods = input.minimumCompletePeriods ?? 5;
  const canClassify =
    input.currentComplete &&
    input.currentMm !== null &&
    values.length >= minimumCompletePeriods &&
    q25Mm !== null &&
    q75Mm !== null;

  let classification: PrecipitationComparison["classification"] = "unavailable";
  if (canClassify && input.currentMm !== null && q25Mm !== null && q75Mm !== null) {
    classification =
      input.currentMm < q25Mm ? "lower" : input.currentMm > q75Mm ? "higher" : "typical";
  }

  return {
    classification,
    medianMm,
    q25Mm,
    q75Mm,
    completePeriodCount: values.length,
    comparisonPeriodCount: input.comparisonPeriodCount,
  };
}

export function selectPrecipitationAggregation(expectedDayCount: number): PrecipitationAggregation {
  if (expectedDayCount <= 31) return "daily";
  if (expectedDayCount <= 180) return "weekly";
  return "monthly";
}

function summarizePrecipitationBucket(
  days: readonly Pick<WeatherMeasurement, "date" | "precipitationMm">[],
  expectedDayCount = days.length,
): PrecipitationTimelinePoint {
  const precipitation = days.flatMap(({ precipitationMm }) =>
    precipitationMm === null ? [] : [precipitationMm],
  );
  const complete = precipitation.length === expectedDayCount;

  return {
    startDate: days[0]?.date ?? "",
    endDate: days.at(-1)?.date ?? "",
    precipitationMm: complete ? precipitation.reduce((total, value) => total + value, 0) : null,
    availableDayCount: precipitation.length,
    expectedDayCount,
    complete,
  };
}

export function aggregatePrecipitationTimeline(
  days: readonly Pick<WeatherMeasurement, "date" | "precipitationMm">[],
  aggregation: PrecipitationAggregation,
): PrecipitationTimelinePoint[] {
  const sortedDays = [...days].sort((left, right) => left.date.localeCompare(right.date));
  if (aggregation === "daily") {
    return sortedDays.map((day) => summarizePrecipitationBucket([day]));
  }
  if (aggregation === "weekly") {
    const buckets: PrecipitationTimelinePoint[] = [];
    for (let index = 0; index < sortedDays.length; index += 7) {
      buckets.push(summarizePrecipitationBucket(sortedDays.slice(index, index + 7)));
    }
    return buckets;
  }

  const monthlyBuckets = new Map<string, Pick<WeatherMeasurement, "date" | "precipitationMm">[]>();
  for (const day of sortedDays) {
    const month = day.date.slice(0, 7);
    const bucket = monthlyBuckets.get(month) ?? [];
    bucket.push(day);
    monthlyBuckets.set(month, bucket);
  }
  return [...monthlyBuckets.values()].map((bucket) => summarizePrecipitationBucket(bucket));
}

export function comparePrecipitationTimeline(input: {
  selectedDays: readonly Pick<WeatherMeasurement, "date" | "precipitationMm">[];
  historicalSeries: readonly {
    year: number;
    days: readonly Pick<WeatherMeasurement, "date" | "precipitationMm">[];
  }[];
  aggregation: PrecipitationAggregation;
  minimumCompletePeriods?: number;
}): PrecipitationTimelineComparison {
  const selectedPoints = aggregatePrecipitationTimeline(input.selectedDays, input.aggregation);
  const minimumCompletePeriods = input.minimumCompletePeriods ?? 5;
  let bucketOffset = 0;

  const points = selectedPoints.map((selectedPoint) => {
    const expectedDayCount = selectedPoint.expectedDayCount;
    const historicalPeriods = input.historicalSeries.map(({ days, year }) => ({
      ...summarizePrecipitationBucket(
        [...days]
          .sort((left, right) => left.date.localeCompare(right.date))
          .slice(bucketOffset, bucketOffset + expectedDayCount),
        expectedDayCount,
      ),
      year,
    }));
    const completeHistoricalValues = historicalPeriods.flatMap((period) =>
      period.complete && period.precipitationMm !== null ? [period.precipitationMm] : [],
    );
    const historicalMedianMm =
      completeHistoricalValues.length >= minimumCompletePeriods
        ? calculateQuantile(completeHistoricalValues, 0.5)
        : null;
    const differenceFromHistoricalMedianMm =
      selectedPoint.complete &&
      selectedPoint.precipitationMm !== null &&
      historicalMedianMm !== null
        ? selectedPoint.precipitationMm - historicalMedianMm
        : null;

    bucketOffset += expectedDayCount;
    return {
      ...selectedPoint,
      historicalMedianMm,
      differenceFromHistoricalMedianMm,
      historicalCompletePeriodCount: completeHistoricalValues.length,
      historicalComparisonPeriodCount: input.historicalSeries.length,
      historicalPeriods,
    };
  });
  const comparablePoints = points.filter(
    (point) => point.differenceFromHistoricalMedianMm !== null,
  );

  return {
    points,
    lowerThanHistoricalMedianCount: comparablePoints.filter(
      (point) => (point.differenceFromHistoricalMedianMm ?? 0) < 0,
    ).length,
    comparablePointCount: comparablePoints.length,
    totalPointCount: points.length,
  };
}

export type Fao56Input = {
  date: string;
  latitude: number;
  elevationMeters: number;
  temperatureMinCelsius: number;
  temperatureMaxCelsius: number;
  temperatureMeanCelsius: number;
  dewPointCelsius: number;
  windSpeed2MetersPerSecond: number;
  surfacePressureKilopascals: number;
  solarRadiationMegajoulesPerSquareMeter: number;
};

function saturationVaporPressure(temperatureCelsius: number): number {
  return 0.6108 * Math.exp((17.27 * temperatureCelsius) / (temperatureCelsius + 237.3));
}

export function calculateFao56ReferenceEvapotranspiration(input: Fao56Input): number {
  const dayOfYear = Math.floor(
    (parseDate(input.date).getTime() - Date.UTC(parseDate(input.date).getUTCFullYear(), 0, 0)) /
      DAY_MS,
  );
  const latitudeRadians = (input.latitude * Math.PI) / 180;
  const inverseDistance = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const solarDeclination = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const sunsetHourAngle = Math.acos(
    Math.max(-1, Math.min(1, -Math.tan(latitudeRadians) * Math.tan(solarDeclination))),
  );
  const extraterrestrialRadiation =
    ((24 * 60) / Math.PI) *
    0.082 *
    inverseDistance *
    (sunsetHourAngle * Math.sin(latitudeRadians) * Math.sin(solarDeclination) +
      Math.cos(latitudeRadians) * Math.cos(solarDeclination) * Math.sin(sunsetHourAngle));
  const clearSkyRadiation = (0.75 + 0.00002 * input.elevationMeters) * extraterrestrialRadiation;
  const netShortwaveRadiation = 0.77 * input.solarRadiationMegajoulesPerSquareMeter;
  const actualVaporPressure = saturationVaporPressure(input.dewPointCelsius);
  const cloudiness =
    clearSkyRadiation > 0
      ? 1.35 * Math.min(1, input.solarRadiationMegajoulesPerSquareMeter / clearSkyRadiation) - 0.35
      : 0;
  const stefanBoltzmann = 4.903e-9;
  const netLongwaveRadiation =
    stefanBoltzmann *
    (((input.temperatureMaxCelsius + 273.16) ** 4 + (input.temperatureMinCelsius + 273.16) ** 4) /
      2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(0, actualVaporPressure))) *
    Math.max(0, cloudiness);
  const netRadiation = netShortwaveRadiation - netLongwaveRadiation;
  const meanSaturationVaporPressure =
    (saturationVaporPressure(input.temperatureMaxCelsius) +
      saturationVaporPressure(input.temperatureMinCelsius)) /
    2;
  const slope =
    (4098 * saturationVaporPressure(input.temperatureMeanCelsius)) /
    (input.temperatureMeanCelsius + 237.3) ** 2;
  const psychrometricConstant = 0.000665 * input.surfacePressureKilopascals;
  const windSpeedAt2Meters = input.windSpeed2MetersPerSecond;
  const numerator =
    0.408 * slope * netRadiation +
    psychrometricConstant *
      (900 / (input.temperatureMeanCelsius + 273)) *
      windSpeedAt2Meters *
      (meanSaturationVaporPressure - actualVaporPressure);
  const denominator = slope + psychrometricConstant * (1 + 0.34 * windSpeedAt2Meters);

  return Math.max(0, numerator / denominator);
}

export function summarizeSolarRadiationPeriod(
  days: readonly { date: string; solarRadiationMjPerM2: number | null }[],
  startDate: string,
  endDate: string,
): { solarRadiationMjPerM2: number | null; solarRadiationAvailableDayCount: number } {
  const byDate = new Map(days.map((day) => [day.date, day.solarRadiationMjPerM2]));
  const expectedDayCount = countDays(startDate, endDate);
  let total = 0;
  let availableDayCount = 0;
  for (let offset = 0; offset < expectedDayCount; offset += 1) {
    const value = byDate.get(shiftDays(startDate, offset));
    if (value !== undefined && value !== null) {
      total += value;
      availableDayCount += 1;
    }
  }
  return {
    solarRadiationMjPerM2: availableDayCount === expectedDayCount ? total : null,
    solarRadiationAvailableDayCount: availableDayCount,
  };
}
