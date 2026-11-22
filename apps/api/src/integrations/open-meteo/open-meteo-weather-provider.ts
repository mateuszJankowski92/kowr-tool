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

const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 2_000;
const DAILY_VARIABLES = [
  "precipitation_sum",
  "shortwave_radiation_sum",
  "et0_fao_evapotranspiration",
  "temperature_2m_mean",
  "temperature_2m_min",
  "temperature_2m_max",
].join(",");

const NullableNumbersSchema = z.array(z.number().nullable());
const OpenMeteoResponseSchema = z
  .object({
    daily_units: z
      .object({ shortwave_radiation_sum: z.literal("MJ/m²").optional() })
      .passthrough()
      .optional(),
    daily: z
      .object({
        time: z.array(z.iso.date()),
        precipitation_sum: NullableNumbersSchema,
        shortwave_radiation_sum: NullableNumbersSchema.optional(),
        et0_fao_evapotranspiration: NullableNumbersSchema,
        temperature_2m_mean: NullableNumbersSchema,
        temperature_2m_min: NullableNumbersSchema,
        temperature_2m_max: NullableNumbersSchema,
      })
      .passthrough(),
  })
  .passthrough();

type OpenMeteoOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
  model?: "era5" | "ecmwf_ifs";
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

function createUrl(
  longitude: number,
  latitude: number,
  startDate: string,
  endDate: string,
  model: "era5" | "ecmwf_ifs",
): URL {
  const url = new URL(OPEN_METEO_ARCHIVE_URL);
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("daily", DAILY_VARIABLES);
  url.searchParams.set("timezone", "Europe/Warsaw");
  // Standalone ERA5-Land omits precipitation and cannot supply the complete balance inputs.
  url.searchParams.set("models", model);
  return url;
}

function mapResponse(
  payload: unknown,
  retrievedAt: string,
  model: "era5" | "ecmwf_ifs",
): ProvidedWeatherSeries {
  const parsed = OpenMeteoResponseSchema.safeParse(payload);
  if (!parsed.success) throw new WeatherConditionsProviderError("INVALID_RESPONSE", parsed.error);

  const daily = parsed.data.daily;
  const expectedLength = daily.time.length;
  const arrays = [
    daily.precipitation_sum,
    daily.et0_fao_evapotranspiration,
    daily.temperature_2m_mean,
    daily.temperature_2m_min,
    daily.temperature_2m_max,
  ];
  if (daily.shortwave_radiation_sum) arrays.push(daily.shortwave_radiation_sum);
  if (arrays.some((values) => values.length !== expectedLength)) {
    throw new WeatherConditionsProviderError("INVALID_RESPONSE");
  }

  return {
    days: daily.time.map((date, index) => ({
      date,
      precipitationMm: daily.precipitation_sum[index] ?? null,
      solarRadiationMjPerM2: daily.shortwave_radiation_sum?.[index] ?? null,
      et0Mm: daily.et0_fao_evapotranspiration[index] ?? null,
      temperatureMeanCelsius: daily.temperature_2m_mean[index] ?? null,
      temperatureMinCelsius: daily.temperature_2m_min[index] ?? null,
      temperatureMaxCelsius: daily.temperature_2m_max[index] ?? null,
    })),
    source: {
      id: model === "era5" ? "open-meteo-era5" : "open-meteo-ecmwf-ifs",
      provider: "Open-Meteo",
      dataset: "Historical Weather API",
      model: model === "era5" ? "ERA5" : "ECMWF IFS operational analysis",
      spatialResolution: model === "era5" ? "0.25° (about 25 km)" : "0.1° (about 9 km)",
      timeStandard: "Daily values in Europe/Warsaw time",
      license: "CC BY 4.0",
      sourceUrl: OPEN_METEO_ARCHIVE_URL,
      retrievedAt,
    },
  };
}

export function createOpenMeteoWeatherProvider(
  options: OpenMeteoOptions,
): WeatherConditionsProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const gate = createWeatherRequestGate(2);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const model = options.model ?? "era5";
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
    id: model === "era5" ? "open-meteo-era5" : "open-meteo-ecmwf-ifs",
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
      const url = createUrl(longitude, latitude, startDate, endDate, model);
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
            return mapResponse(payload, now().toISOString(), model);
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
                provider: "Open-Meteo",
                attempt: attempt + 1,
                durationMs: Math.round(performance.now() - startedAt),
                errorCode: `OPEN_METEO_${providerError.code}`,
                willRetry,
              },
              "Weather provider request failed",
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
