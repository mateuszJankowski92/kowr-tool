import type { WeatherDay, WeatherSource } from "@kowr/contracts";
import type {
  ProvidedWeatherSeries,
  WeatherConditionsProvider,
} from "../weather-conditions/weather-conditions-provider.js";
import { WeatherConditionsProviderError } from "../weather-conditions/weather-conditions-provider.js";

const DAY_MILLISECONDS = 86_400_000;

export type WeatherProviderAttempt = {
  providerRole: "primary" | "fallback";
  providerId?: string;
  outcome: "complete" | "partial" | "failed";
  errorCode?: WeatherConditionsProviderError["code"] | "UNKNOWN";
};

export type ContinuousWeatherSeries = {
  status: "complete" | "partial";
  days: WeatherDay[];
  source: WeatherSource;
  expectedDayCount: number;
  completeDayCount: number;
  precipitationAvailableDayCount: number;
  et0AvailableDayCount: number;
  missingDays: {
    date: string;
    fields: ("precipitation" | "et0")[];
    cause: "not-yet-published" | "missing-date" | "missing-variable";
  }[];
  latestContiguousCompleteDate: string | null;
  attempts: WeatherProviderAttempt[];
};

export class ContinuousWeatherUnavailableError extends Error {
  readonly attempts: readonly WeatherProviderAttempt[];

  constructor(cause?: unknown, attempts: readonly WeatherProviderAttempt[] = []) {
    super("No weather provider returned a usable response.", { cause });
    this.name = "ContinuousWeatherUnavailableError";
    this.attempts = attempts;
  }
}

function errorCode(error: unknown): WeatherProviderAttempt["errorCode"] {
  return error instanceof WeatherConditionsProviderError ? error.code : "UNKNOWN";
}

function parseDate(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function expectedDayCount(startDate: string, endDate: string): number {
  return Math.round((parseDate(endDate) - parseDate(startDate)) / DAY_MILLISECONDS) + 1;
}

function normalizeSeries(
  series: ProvidedWeatherSeries,
  startDate: string,
  endDate: string,
  ongoingDate?: string,
): Omit<ContinuousWeatherSeries, "attempts"> {
  const count = expectedDayCount(startDate, endDate);
  const byDate = new Map(
    series.days
      .filter(({ date }) => date >= startDate && date <= endDate && date !== ongoingDate)
      .map((day) => [day.date, day]),
  );
  const latestReturnedDate = [...byDate.keys()].sort().at(-1) ?? null;
  const start = parseDate(startDate);
  const days = Array.from({ length: count }, (_, offset): WeatherDay => {
    const date = new Date(start + offset * DAY_MILLISECONDS).toISOString().slice(0, 10);
    return (
      byDate.get(date) ?? {
        date,
        precipitationMm: null,
        et0Mm: null,
        temperatureMeanCelsius: null,
        temperatureMinCelsius: null,
        temperatureMaxCelsius: null,
        solarRadiationMjPerM2: null,
      }
    );
  });
  const precipitationAvailableDayCount = days.filter(
    ({ precipitationMm }) => precipitationMm !== null,
  ).length;
  const et0AvailableDayCount = days.filter(({ et0Mm }) => et0Mm !== null).length;
  const completeDayCount = days.filter(
    ({ precipitationMm, et0Mm }) => precipitationMm !== null && et0Mm !== null,
  ).length;
  const missingDays = days.flatMap(({ date, precipitationMm, et0Mm }) => {
    const fields: ("precipitation" | "et0")[] = [];
    if (precipitationMm === null) fields.push("precipitation");
    if (et0Mm === null) fields.push("et0");
    if (fields.length === 0) return [];
    const cause =
      date === ongoingDate
        ? ("not-yet-published" as const)
        : byDate.has(date)
          ? ("missing-variable" as const)
          : latestReturnedDate !== null && date > latestReturnedDate
            ? ("not-yet-published" as const)
            : ("missing-date" as const);
    return [{ date, fields, cause }];
  });
  const firstIncompleteIndex = days.findIndex(
    ({ precipitationMm, et0Mm }) => precipitationMm === null || et0Mm === null,
  );
  const latestContiguousCompleteDate =
    firstIncompleteIndex === 0
      ? null
      : firstIncompleteIndex === -1
        ? (days.at(-1)?.date ?? null)
        : (days[firstIncompleteIndex - 1]?.date ?? null);
  const status =
    precipitationAvailableDayCount === count && et0AvailableDayCount === count
      ? "complete"
      : "partial";

  return {
    status,
    days,
    source: series.source,
    expectedDayCount: count,
    completeDayCount,
    precipitationAvailableDayCount,
    et0AvailableDayCount,
    missingDays,
    latestContiguousCompleteDate,
  };
}

function isMoreComplete(
  candidate: Omit<ContinuousWeatherSeries, "attempts">,
  current: Omit<ContinuousWeatherSeries, "attempts">,
): boolean {
  if (candidate.completeDayCount !== current.completeDayCount) {
    return candidate.completeDayCount > current.completeDayCount;
  }
  return (
    (candidate.latestContiguousCompleteDate ?? "") > (current.latestContiguousCompleteDate ?? "")
  );
}

async function fetchSeries(
  provider: WeatherConditionsProvider,
  longitude: number,
  latitude: number,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
  ongoingDate?: string,
) {
  // A daily total for the ongoing Polish calendar day cannot be a completed observation.
  const providerEndDate =
    endDate === ongoingDate && startDate < endDate
      ? new Date(parseDate(endDate) - DAY_MILLISECONDS).toISOString().slice(0, 10)
      : endDate;
  return normalizeSeries(
    await provider.getDaily(longitude, latitude, startDate, providerEndDate, signal),
    startDate,
    endDate,
    ongoingDate,
  );
}

export async function getContinuousWeather(input: {
  longitude: number;
  latitude: number;
  startDate: string;
  endDate: string;
  primaryProvider: WeatherConditionsProvider;
  fallbackProvider: WeatherConditionsProvider;
  recentProvider?: WeatherConditionsProvider;
  signal?: AbortSignal;
  ongoingDate?: string;
}): Promise<ContinuousWeatherSeries> {
  const attempts: WeatherProviderAttempt[] = [];
  let primary: Omit<ContinuousWeatherSeries, "attempts"> | null = null;
  const completePublishedPeriod = (series: Omit<ContinuousWeatherSeries, "attempts">) =>
    series.status === "complete" ||
    (input.endDate === input.ongoingDate &&
      series.expectedDayCount > 1 &&
      series.completeDayCount === series.expectedDayCount - 1);

  try {
    primary = await fetchSeries(
      input.primaryProvider,
      input.longitude,
      input.latitude,
      input.startDate,
      input.endDate,
      input.signal,
      input.ongoingDate,
    );
    attempts.push({
      providerRole: "primary",
      providerId: input.primaryProvider.id,
      outcome: primary.status,
    });
    if (completePublishedPeriod(primary)) return { ...primary, attempts };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    attempts.push({
      providerRole: "primary",
      providerId: input.primaryProvider.id,
      outcome: "failed",
      errorCode: errorCode(error),
    });
  }

  // IFS covers 2017 onward and can supply a complete recent season before ERA5 is published.
  // It is an alternative for the whole range; never append its days to an ERA5 prefix.
  if (input.recentProvider && input.startDate >= "2017-01-01") {
    try {
      const recent = await fetchSeries(
        input.recentProvider,
        input.longitude,
        input.latitude,
        input.startDate,
        input.endDate,
        input.signal,
        input.ongoingDate,
      );
      attempts.push({
        providerRole: "fallback",
        providerId: input.recentProvider.id,
        outcome: recent.status,
      });
      if (completePublishedPeriod(recent)) return { ...recent, attempts };
      if (primary === null || isMoreComplete(recent, primary)) primary = recent;
    } catch (error) {
      if (input.signal?.aborted) throw error;
      attempts.push({
        providerRole: "fallback",
        providerId: input.recentProvider.id,
        outcome: "failed",
        errorCode: errorCode(error),
      });
    }
  }

  try {
    const fallback = await fetchSeries(
      input.fallbackProvider,
      input.longitude,
      input.latitude,
      input.startDate,
      input.endDate,
      input.signal,
      input.ongoingDate,
    );
    attempts.push({
      providerRole: "fallback",
      providerId: input.fallbackProvider.id,
      outcome: fallback.status,
    });
    if (fallback.status === "complete" || primary === null || isMoreComplete(fallback, primary)) {
      return { ...fallback, attempts };
    }
  } catch (error) {
    if (input.signal?.aborted) throw error;
    attempts.push({
      providerRole: "fallback",
      providerId: input.fallbackProvider.id,
      outcome: "failed",
      errorCode: errorCode(error),
    });
    if (primary === null) throw new ContinuousWeatherUnavailableError(error, attempts);
  }

  if (primary) return { ...primary, attempts };
  throw new ContinuousWeatherUnavailableError(undefined, attempts);
}
