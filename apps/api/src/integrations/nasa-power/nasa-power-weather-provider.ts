import { calculateFao56ReferenceEvapotranspiration } from "@kowr/analysis";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type {
  ProvidedWeatherSeries,
  WeatherConditionsProvider,
} from "../../features/weather-conditions/weather-conditions-provider.js";
import {
  createWeatherRequestGate,
  WeatherConditionsProviderError,
} from "../../features/weather-conditions/weather-conditions-provider.js";

const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 2_000;
const PARAMETERS = [
  "PRECTOTCORR",
  "T2M",
  "T2M_MAX",
  "T2M_MIN",
  "T2MDEW",
  "WS2M",
  "PS",
  "ALLSKY_SFC_SW_DWN",
] as const;
const MISSING_VALUE = -999;

const ParameterValuesSchema = z.record(z.string(), z.number().nullable());
const unitSchema = (unit: string) =>
  z
    .object({
      units: z.literal(unit),
    })
    .passthrough();
const NasaPowerResponseSchema = z
  .object({
    geometry: z
      .object({
        coordinates: z.array(z.number()).min(2),
      })
      .passthrough(),
    properties: z
      .object({
        parameter: z.record(z.string(), ParameterValuesSchema),
      })
      .passthrough(),
    parameters: z
      .object({
        PRECTOTCORR: unitSchema("mm/day"),
        T2M: unitSchema("C"),
        T2M_MAX: unitSchema("C"),
        T2M_MIN: unitSchema("C"),
        T2MDEW: unitSchema("C"),
        WS2M: unitSchema("m/s"),
        PS: unitSchema("kPa"),
        ALLSKY_SFC_SW_DWN: unitSchema("MJ/m^2/day"),
      })
      .passthrough(),
  })
  .passthrough();

type NasaPowerOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

function retryDelayMs(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function compactDate(value: string): string {
  return value.replaceAll("-", "");
}

function displayDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function createUrl(longitude: number, latitude: number, startDate: string, endDate: string): URL {
  const url = new URL(NASA_POWER_URL);
  url.searchParams.set("parameters", PARAMETERS.join(","));
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("start", compactDate(startDate));
  url.searchParams.set("end", compactDate(endDate));
  url.searchParams.set("format", "JSON");
  url.searchParams.set("time-standard", "UTC");
  return url;
}

function valueFor(
  parameters: Record<string, Record<string, number | null>>,
  parameter: (typeof PARAMETERS)[number],
  date: string,
): number | null {
  const value = parameters[parameter]?.[date];
  return value === undefined || value === null || value <= MISSING_VALUE ? null : value;
}

function mapResponse(
  payload: unknown,
  latitude: number,
  retrievedAt: string,
): ProvidedWeatherSeries {
  const parsed = NasaPowerResponseSchema.safeParse(payload);
  if (!parsed.success) throw new WeatherConditionsProviderError("INVALID_RESPONSE", parsed.error);

  const parameters = parsed.data.properties.parameter;
  const dateKeys = Object.keys(parameters.PRECTOTCORR ?? {}).sort();
  const elevationMeters = parsed.data.geometry.coordinates[2] ?? 0;
  const days = dateKeys.map((dateKey) => {
    const date = displayDate(dateKey);
    const precipitationMm = valueFor(parameters, "PRECTOTCORR", dateKey);
    const temperatureMeanCelsius = valueFor(parameters, "T2M", dateKey);
    const temperatureMaxCelsius = valueFor(parameters, "T2M_MAX", dateKey);
    const temperatureMinCelsius = valueFor(parameters, "T2M_MIN", dateKey);
    const dewPointCelsius = valueFor(parameters, "T2MDEW", dateKey);
    const windSpeed2MetersPerSecond = valueFor(parameters, "WS2M", dateKey);
    const surfacePressureKilopascals = valueFor(parameters, "PS", dateKey);
    const solarRadiationMegajoules = valueFor(parameters, "ALLSKY_SFC_SW_DWN", dateKey);
    const et0Inputs = [
      temperatureMeanCelsius,
      temperatureMaxCelsius,
      temperatureMinCelsius,
      dewPointCelsius,
      windSpeed2MetersPerSecond,
      surfacePressureKilopascals,
      solarRadiationMegajoules,
    ];
    const et0Mm = et0Inputs.every((value) => value !== null)
      ? calculateFao56ReferenceEvapotranspiration({
          date,
          latitude,
          elevationMeters,
          temperatureMeanCelsius: temperatureMeanCelsius as number,
          temperatureMaxCelsius: temperatureMaxCelsius as number,
          temperatureMinCelsius: temperatureMinCelsius as number,
          dewPointCelsius: dewPointCelsius as number,
          windSpeed2MetersPerSecond: windSpeed2MetersPerSecond as number,
          surfacePressureKilopascals: surfacePressureKilopascals as number,
          solarRadiationMegajoulesPerSquareMeter: solarRadiationMegajoules as number,
        })
      : null;

    return {
      date,
      precipitationMm,
      et0Mm,
      temperatureMeanCelsius,
      temperatureMinCelsius,
      temperatureMaxCelsius,
      solarRadiationMjPerM2: solarRadiationMegajoules,
    };
  });

  return {
    days,
    source: {
      id: "nasa-power-daily",
      provider: "NASA POWER",
      dataset: "POWER Daily API",
      model: "MERRA-2 / GEOS-IT",
      spatialResolution: "Meteorology 0.5° × 0.625°; solar radiation 1°",
      timeStandard: "Daily values in UTC",
      license: "NASA open data; attribution requested",
      sourceUrl: NASA_POWER_URL,
      retrievedAt,
    },
  };
}

export function createNasaPowerWeatherProvider(
  options: NasaPowerOptions,
): WeatherConditionsProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const gate = createWeatherRequestGate(2);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const cache = new Map<
    string,
    {
      expiresAt: number;
      request: Promise<ProvidedWeatherSeries>;
      longitude: number;
      latitude: number;
      startDate: string;
      endDate: string;
      complete?: ProvidedWeatherSeries;
    }
  >();

  return {
    id: "nasa-power-daily",
    async getDaily(longitude, latitude, startDate, endDate, signal) {
      if (signal?.aborted) throw signal.reason;
      for (const entry of cache.values()) {
        if (
          entry.complete &&
          entry.expiresAt > performance.now() &&
          entry.longitude === longitude &&
          entry.latitude === latitude &&
          entry.startDate <= startDate &&
          entry.endDate >= endDate
        ) {
          return {
            ...entry.complete,
            days: entry.complete.days.filter((day) => day.date >= startDate && day.date <= endDate),
          };
        }
      }
      const url = createUrl(longitude, latitude, startDate, endDate);
      const key = url.toString();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > performance.now()) return cached.request;
      if (cached) cache.delete(key);

      const request = (async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const startedAt = performance.now();
          const timeoutSignal = AbortSignal.timeout(timeoutMs);
          const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
          try {
            const response = await gate.run(async () => {
              const response = await fetchImplementation(url, {
                headers: { Accept: "application/json" },
                signal: requestSignal,
              });
              if (response.status === 429) {
                const delay = retryDelayMs(response);
                if (delay === null || delay > MAX_RETRY_DELAY_MS) gate.blockFor(delay ?? 60_000);
              }
              return response;
            }, requestSignal);
            if (response.status === 429) {
              const delay = retryDelayMs(response);
              if (attempt === 0 && delay !== null && delay <= MAX_RETRY_DELAY_MS) {
                await waitForRetry(delay, requestSignal);
                continue;
              }
              throw new WeatherConditionsProviderError("RATE_LIMITED");
            }
            if (!response.ok) {
              if (response.status >= 500) {
                throw new WeatherConditionsProviderError("PROVIDER_UNAVAILABLE");
              }
              throw new WeatherConditionsProviderError("REQUEST_FAILED");
            }

            let payload: unknown;
            try {
              payload = await response.json();
            } catch (error) {
              throw new WeatherConditionsProviderError("INVALID_RESPONSE", error);
            }
            return mapResponse(payload, latitude, now().toISOString());
          } catch (error) {
            if (signal?.aborted) throw error;
            const providerError =
              error instanceof WeatherConditionsProviderError
                ? error
                : new WeatherConditionsProviderError(
                    timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
                    error,
                  );
            const willRetry =
              attempt === 0 &&
              (providerError.code === "TIMEOUT" || providerError.code === "PROVIDER_UNAVAILABLE");
            options.logger.warn(
              {
                provider: "NASA POWER",
                attempt: attempt + 1,
                durationMs: Math.round(performance.now() - startedAt),
                errorCode: `NASA_POWER_${providerError.code}`,
                willRetry,
              },
              "Weather fallback provider request failed",
            );
            if (!willRetry) throw providerError;
            await waitForRetry(500, signal ?? AbortSignal.timeout(1_000));
          }
        }
        throw new WeatherConditionsProviderError("REQUEST_FAILED");
      })();

      cache.set(key, {
        expiresAt: performance.now() + CACHE_TTL_MS,
        request,
        longitude,
        latitude,
        startDate,
        endDate,
      });
      if (cache.size > 128) cache.delete(cache.keys().next().value ?? key);
      request.then(
        (series) => {
          const expectedDays =
            Math.round(
              (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
                86_400_000,
            ) + 1;
          const dates = new Set(
            series.days
              .filter(
                (day) =>
                  day.date >= startDate &&
                  day.date <= endDate &&
                  day.precipitationMm !== null &&
                  day.et0Mm !== null &&
                  day.temperatureMeanCelsius !== null &&
                  day.temperatureMinCelsius !== null &&
                  day.temperatureMaxCelsius !== null,
              )
              .map((day) => day.date),
          );
          if (cache.get(key)?.request === request) {
            if (dates.size !== expectedDays) cache.delete(key);
            else {
              const entry = cache.get(key);
              if (entry) entry.complete = series;
            }
          }
        },
        () => {
          if (cache.get(key)?.request === request) cache.delete(key);
        },
      );
      return request;
    },
  };
}
