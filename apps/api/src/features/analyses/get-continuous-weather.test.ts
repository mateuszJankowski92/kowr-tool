import type { WeatherSource } from "@kowr/contracts";
import { describe, expect, it, vi } from "vitest";
import type { WeatherConditionsProvider } from "../weather-conditions/weather-conditions-provider.js";
import { getContinuousWeather } from "./get-continuous-weather.js";

const source: WeatherSource = {
  id: "open-meteo-era5-land",
  provider: "Open-Meteo",
  dataset: "Historical Weather API",
  model: "ERA5-Land",
  spatialResolution: "0.1°",
  timeStandard: "Europe/Warsaw",
  license: "CC BY 4.0",
  sourceUrl: "https://archive-api.open-meteo.com/v1/archive",
  retrievedAt: "2026-11-21T12:00:00.000Z",
};

describe("getContinuousWeather", () => {
  it("normalizes missing dates to null without mixing providers", async () => {
    const partial: WeatherConditionsProvider = {
      async getDaily() {
        return {
          source,
          days: [
            {
              date: "2025-04-01",
              precipitationMm: 1,
              et0Mm: 2,
              temperatureMeanCelsius: null,
              temperatureMinCelsius: null,
              temperatureMaxCelsius: null,
              solarRadiationMjPerM2: null,
            },
          ],
        };
      },
    };
    const result = await getContinuousWeather({
      longitude: 21.5,
      latitude: 52.1,
      startDate: "2025-04-01",
      endDate: "2025-04-02",
      primaryProvider: partial,
      fallbackProvider: partial,
    });

    expect(result.status).toBe("partial");
    expect(result.days[1]).toMatchObject({
      date: "2025-04-02",
      precipitationMm: null,
      et0Mm: null,
    });
    expect(result.source.provider).toBe("Open-Meteo");
    expect(result.missingDays).toEqual([
      {
        date: "2025-04-02",
        fields: ["precipitation", "et0"],
        cause: "not-yet-published",
      },
    ]);
    expect(result.latestContiguousCompleteDate).toBe("2025-04-01");
  });

  it("distinguishes a missing variable from a missing date inside the series", async () => {
    const partial: WeatherConditionsProvider = {
      id: "open-meteo-era5-land",
      async getDaily() {
        return {
          source,
          days: [
            {
              date: "2025-04-01",
              precipitationMm: 1,
              et0Mm: 2,
              temperatureMeanCelsius: null,
              temperatureMinCelsius: null,
              temperatureMaxCelsius: null,
              solarRadiationMjPerM2: null,
            },
            {
              date: "2025-04-03",
              precipitationMm: 1,
              et0Mm: null,
              temperatureMeanCelsius: null,
              temperatureMinCelsius: null,
              temperatureMaxCelsius: null,
              solarRadiationMjPerM2: null,
            },
          ],
        };
      },
    };

    const result = await getContinuousWeather({
      longitude: 21.5,
      latitude: 52.1,
      startDate: "2025-04-01",
      endDate: "2025-04-03",
      primaryProvider: partial,
      fallbackProvider: partial,
    });

    expect(result.missingDays).toEqual([
      { date: "2025-04-02", fields: ["precipitation", "et0"], cause: "missing-date" },
      { date: "2025-04-03", fields: ["et0"], cause: "missing-variable" },
    ]);
    expect(result.attempts[0]).toMatchObject({ providerId: "open-meteo-era5-land" });
  });

  it("keeps the more complete single-provider series when both providers are partial", async () => {
    const primary: WeatherConditionsProvider = {
      async getDaily() {
        return {
          source,
          days: [
            {
              date: "2025-04-01",
              precipitationMm: 1,
              et0Mm: 2,
              temperatureMeanCelsius: null,
              temperatureMinCelsius: null,
              temperatureMaxCelsius: null,
              solarRadiationMjPerM2: null,
            },
          ],
        };
      },
    };
    const fallbackSource = { ...source, id: "nasa-power-daily", provider: "NASA POWER" } as const;
    const fallback: WeatherConditionsProvider = {
      async getDaily() {
        return {
          source: fallbackSource,
          days: [
            {
              date: "2025-04-01",
              precipitationMm: 1,
              et0Mm: 2,
              temperatureMeanCelsius: null,
              temperatureMinCelsius: null,
              temperatureMaxCelsius: null,
              solarRadiationMjPerM2: null,
            },
            {
              date: "2025-04-02",
              precipitationMm: 0,
              et0Mm: 2,
              temperatureMeanCelsius: null,
              temperatureMinCelsius: null,
              temperatureMaxCelsius: null,
              solarRadiationMjPerM2: null,
            },
          ],
        };
      },
    };

    const result = await getContinuousWeather({
      longitude: 21.5,
      latitude: 52.1,
      startDate: "2025-04-01",
      endDate: "2025-04-03",
      primaryProvider: primary,
      fallbackProvider: fallback,
    });

    expect(result.source.provider).toBe("NASA POWER");
    expect(result.completeDayCount).toBe(2);
    expect(result.latestContiguousCompleteDate).toBe("2025-04-02");
    expect(result.attempts).toEqual([
      { providerRole: "primary", outcome: "partial" },
      { providerRole: "fallback", outcome: "partial" },
    ]);
  });

  it("propagates cancellation and does not start fallback", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted: WeatherConditionsProvider = {
      async getDaily() {
        throw controller.signal.reason;
      },
    };
    const fallback: WeatherConditionsProvider = { getDaily: vi.fn() };

    await expect(
      getContinuousWeather({
        longitude: 21.5,
        latitude: 52.1,
        startDate: "2025-04-01",
        endDate: "2025-04-02",
        primaryProvider: aborted,
        fallbackProvider: fallback,
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
    expect(fallback.getDaily).not.toHaveBeenCalled();
  });
});

describe("recent operational weather", () => {
  const day = (date: string, precipitationMm: number, et0Mm: number | null) => ({
    date,
    precipitationMm,
    et0Mm,
    temperatureMeanCelsius: 10,
    temperatureMinCelsius: 5,
    temperatureMaxCelsius: 15,
    solarRadiationMjPerM2: null,
  });

  it("replaces the whole delayed reanalysis range with complete IFS analysis", async () => {
    const primary: WeatherConditionsProvider = {
      id: "open-meteo-era5",
      getDaily: vi.fn().mockResolvedValue({
        source: { ...source, id: "open-meteo-era5", model: "ERA5" },
        days: [day("2026-11-20", 99, 1), day("2026-11-21", 0, null)],
      }),
    };
    const recent: WeatherConditionsProvider = {
      id: "open-meteo-ecmwf-ifs",
      getDaily: vi.fn().mockResolvedValue({
        source: { ...source, id: "open-meteo-ecmwf-ifs", model: "ECMWF IFS operational analysis" },
        days: [day("2026-11-20", 2, 1), day("2026-11-21", 3, 1)],
      }),
    };
    const fallback: WeatherConditionsProvider = { getDaily: vi.fn() };
    const result = await getContinuousWeather({
      longitude: 20.65,
      latitude: 54.17,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
      primaryProvider: primary,
      recentProvider: recent,
      fallbackProvider: fallback,
    });
    expect(result.status).toBe("complete");
    expect(result.source.id).toBe("open-meteo-ecmwf-ifs");
    expect(result.days.map(({ precipitationMm }) => precipitationMm)).toEqual([2, 3]);
    expect(recent.getDaily).toHaveBeenCalledWith(
      20.65,
      54.17,
      "2026-11-20",
      "2026-11-21",
      undefined,
    );
    expect(fallback.getDaily).not.toHaveBeenCalled();
  });

  it("keeps older archives available without calling IFS outside its coverage", async () => {
    const primary: WeatherConditionsProvider = {
      getDaily: vi.fn().mockRejectedValue(new Error("unavailable")),
    };
    const recent: WeatherConditionsProvider = { getDaily: vi.fn() };
    const fallback: WeatherConditionsProvider = {
      getDaily: vi.fn().mockResolvedValue({ source, days: [day("2016-11-21", 2, 1)] }),
    };
    const result = await getContinuousWeather({
      longitude: 20.65,
      latitude: 54.17,
      startDate: "2016-11-21",
      endDate: "2016-11-21",
      primaryProvider: primary,
      recentProvider: recent,
      fallbackProvider: fallback,
    });
    expect(result.status).toBe("complete");
    expect(recent.getDaily).not.toHaveBeenCalled();
  });
});

describe("ongoing daily data", () => {
  it("ignores an apparent complete total returned for the ongoing day", async () => {
    const provider: WeatherConditionsProvider = {
      async getDaily() {
        return {
          source,
          days: [
            {
              date: "2026-11-22",
              precipitationMm: 99,
              et0Mm: 3,
              temperatureMeanCelsius: 12,
              temperatureMinCelsius: 1,
              temperatureMaxCelsius: 15,
              solarRadiationMjPerM2: 7,
            },
          ],
        };
      },
    };
    const result = await getContinuousWeather({
      longitude: 21,
      latitude: 52,
      startDate: "2026-11-22",
      endDate: "2026-11-22",
      ongoingDate: "2026-11-22",
      primaryProvider: provider,
      fallbackProvider: provider,
    });
    expect(result.status).toBe("partial");
    expect(result.completeDayCount).toBe(0);
    expect(result.days[0]?.precipitationMm).toBeNull();
    expect(result.missingDays[0]?.cause).toBe("not-yet-published");
  });
});

describe("ongoing-day fallback policy", () => {
  it("does not fetch another provider solely to fill the unfinished day", async () => {
    const getDaily = vi.fn<WeatherConditionsProvider["getDaily"]>().mockResolvedValue({
      source,
      days: [
        {
          date: "2026-11-21",
          precipitationMm: 1,
          et0Mm: 2,
          temperatureMeanCelsius: 10,
          temperatureMinCelsius: 5,
          temperatureMaxCelsius: 15,
          solarRadiationMjPerM2: 5,
        },
      ],
    });
    const fallback = vi.fn<WeatherConditionsProvider["getDaily"]>();
    const result = await getContinuousWeather({
      longitude: 21,
      latitude: 52,
      startDate: "2026-11-21",
      endDate: "2026-11-22",
      ongoingDate: "2026-11-22",
      primaryProvider: { getDaily },
      fallbackProvider: { getDaily: fallback },
    });
    expect(result.status).toBe("partial");
    expect(result.completeDayCount).toBe(1);
    expect(getDaily).toHaveBeenCalledWith(21, 52, "2026-11-21", "2026-11-21", undefined);
    expect(fallback).not.toHaveBeenCalled();
  });
});
