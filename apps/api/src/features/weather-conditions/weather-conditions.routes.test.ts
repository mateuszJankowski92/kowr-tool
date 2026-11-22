import type { WeatherDay, WeatherSource } from "@kowr/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { WeatherConditionsProvider } from "./weather-conditions-provider.js";
import { WeatherConditionsProviderError } from "./weather-conditions-provider.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

const source: WeatherSource = {
  id: "nasa-power-daily",
  provider: "NASA POWER",
  dataset: "POWER Daily API",
  model: "MERRA-2 / GEOS-IT",
  spatialResolution: "Meteorology 0.5° × 0.625°; solar radiation 1°",
  timeStandard: "Daily values in UTC",
  license: "NASA open data; attribution requested",
  sourceUrl: "https://power.larc.nasa.gov/api/temporal/daily/point",
  retrievedAt: "2026-11-21T12:00:00.000Z",
};

function createDays(startDate: string, endDate: string): WeatherDay[] {
  const days: WeatherDay[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push({
      date: cursor.toISOString().slice(0, 10),
      precipitationMm: 2,
      et0Mm: 3,
      temperatureMeanCelsius: 18,
      temperatureMinCelsius: 12,
      temperatureMaxCelsius: 24,
      solarRadiationMjPerM2: 18,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

describe("POST /api/weather-conditions", () => {
  it("uses one fallback source for the selected and comparable periods", async () => {
    const weatherPrimaryProvider: WeatherConditionsProvider = {
      getDaily: vi.fn(async () => {
        throw new WeatherConditionsProviderError("RATE_LIMITED");
      }),
    };
    const weatherFallbackProvider: WeatherConditionsProvider = {
      getDaily: vi.fn(async (_longitude, _latitude, startDate, endDate) => ({
        days: createDays(startDate, endDate),
        source,
      })),
    };
    const app = await createApp({
      database,
      logger: false,
      weatherPrimaryProvider,
      weatherFallbackProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/weather-conditions",
      payload: {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [21.5, 52.1],
              [21.6, 52.1],
              [21.6, 52.2],
              [21.5, 52.2],
              [21.5, 52.1],
            ],
          ],
        },
        crop: "pszenica-zwyczajna-ozima",
        dateSelection: { type: "day", date: "2026-06-30" },
        periodPreset: "7-days",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      period: { startDate: "2026-06-24", endDate: "2026-06-30", expectedDayCount: 7 },
      summary: { precipitationMm: 14, et0Mm: 21, differenceMm: -7 },
      precipitationTimeline: { aggregation: "daily" },
      precipitationReference: {
        classification: "typical",
        medianMm: 14,
        completePeriodCount: 10,
        comparisonPeriodCount: 10,
        comparisonPeriod: { startDate: "2026-06-24", endDate: "2026-06-30", dayCount: 7 },
      },
      source: { provider: "NASA POWER" },
      sample: { method: "representative-interior-point" },
    });
    expect(response.json().history).toHaveLength(11);
    expect(response.json().precipitationTimeline.points).toHaveLength(7);
    expect(response.json().precipitationTimeline).toMatchObject({
      lowerThanHistoricalMedianCount: 0,
      comparablePointCount: 7,
      totalPointCount: 7,
    });
    expect(response.json().precipitationTimeline.points[0]).toMatchObject({
      precipitationMm: 2,
      historicalMedianMm: 2,
      solarRadiationMjPerM2: 18,
      solarRadiationAvailableDayCount: 1,
      differenceFromHistoricalMedianMm: 0,
      historicalCompletePeriodCount: 10,
      historicalComparisonPeriodCount: 10,
    });
    expect(response.json().precipitationTimeline.points[0].historicalPeriods).toHaveLength(10);
    expect(vi.mocked(weatherPrimaryProvider.getDaily)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(weatherFallbackProvider.getDaily)).toHaveBeenCalledTimes(11);
  });

  it("compares complete precipitation even when ET0 is unavailable", async () => {
    const weatherPrimaryProvider: WeatherConditionsProvider = {
      async getDaily(_longitude, _latitude, startDate, endDate) {
        return {
          days: createDays(startDate, endDate).map((day) => ({ ...day, et0Mm: null })),
          source,
        };
      },
    };
    const weatherFallbackProvider: WeatherConditionsProvider = {
      getDaily: vi.fn(async () => {
        throw new WeatherConditionsProviderError("REQUEST_FAILED");
      }),
    };
    const app = await createApp({
      database,
      logger: false,
      weatherPrimaryProvider,
      weatherFallbackProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/weather-conditions",
      payload: {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [21.5, 52.1],
              [21.6, 52.1],
              [21.6, 52.2],
              [21.5, 52.2],
              [21.5, 52.1],
            ],
          ],
        },
        crop: "pszenica-zwyczajna-ozima",
        dateSelection: { type: "day", date: "2026-06-30" },
        periodPreset: "7-days",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "partial",
      summary: {
        precipitationMm: 14,
        precipitationComplete: true,
        et0Mm: null,
        et0Complete: false,
        differenceMm: null,
      },
      precipitationReference: { classification: "typical", completePeriodCount: 10 },
    });
    expect(response.json().history[0]).toMatchObject({
      precipitationComplete: true,
      et0Complete: false,
      complete: false,
    });
    expect(weatherFallbackProvider.getDaily).not.toHaveBeenCalled();
  });

  it("compares a continuous current prefix with equal-length historical periods", async () => {
    const weatherPrimaryProvider: WeatherConditionsProvider = {
      async getDaily(_longitude, _latitude, startDate, endDate) {
        const days = createDays(startDate, endDate);
        return {
          days: endDate === "2026-06-30" ? days.slice(0, -2) : days,
          source,
        };
      },
    };
    const weatherFallbackProvider: WeatherConditionsProvider = {
      getDaily: vi.fn(async () => {
        throw new WeatherConditionsProviderError("REQUEST_FAILED");
      }),
    };
    const app = await createApp({
      database,
      logger: false,
      weatherPrimaryProvider,
      weatherFallbackProvider,
    });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/weather-conditions",
      payload: {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [21.5, 52.1],
              [21.6, 52.1],
              [21.6, 52.2],
              [21.5, 52.2],
              [21.5, 52.1],
            ],
          ],
        },
        crop: "pszenica-zwyczajna-ozima",
        dateSelection: { type: "day", date: "2026-06-30" },
        periodPreset: "7-days",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "partial",
      summary: {
        precipitationMm: 10,
        precipitationAvailableDayCount: 5,
        expectedDayCount: 7,
        precipitationComplete: false,
      },
      precipitationReference: {
        classification: "typical",
        medianMm: 10,
        completePeriodCount: 10,
        comparisonPeriodCount: 10,
        comparisonPeriod: { startDate: "2026-06-24", endDate: "2026-06-28", dayCount: 5 },
      },
      precipitationTimeline: { comparablePointCount: 5, totalPointCount: 5 },
    });
    expect(response.json().limitations).toContain(
      "Porównanie opadów skrócono do 2026-06-28, czyli ostatniego dnia ciągłego szeregu. Każdy rok odniesienia obejmuje ten sam 5-dniowy fragment okresu.",
    );
    expect(weatherFallbackProvider.getDaily).not.toHaveBeenCalled();
  });
});
