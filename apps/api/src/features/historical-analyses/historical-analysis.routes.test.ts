import {
  HistoricalWaterAssessmentResponseSchema,
  type WeatherDay,
  type WeatherSource,
} from "@kowr/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import type {
  SoilProfileLayer,
  SoilProfileProvider,
} from "../soil-profiles/soil-profile-provider.js";
import type { WeatherConditionsProvider } from "../weather-conditions/weather-conditions-provider.js";
import { WeatherConditionsProviderError } from "../weather-conditions/weather-conditions-provider.js";
import { createHistoricalWaterAssessment } from "./create-historical-water-assessment.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

const sources = {
  openMeteo: {
    id: "open-meteo-era5-land",
    provider: "Open-Meteo",
    dataset: "Historical Weather API",
    model: "ERA5-Land",
    spatialResolution: "0.1° (about 9–11 km)",
    timeStandard: "Daily values in Europe/Warsaw time",
    license: "CC BY 4.0",
    sourceUrl: "https://archive-api.open-meteo.com/v1/archive",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
  nasa: {
    id: "nasa-power-daily",
    provider: "NASA POWER",
    dataset: "POWER Daily API",
    model: "MERRA-2 / GEOS-IT",
    spatialResolution: "Meteorology 0.5° × 0.625°; solar radiation 1°",
    timeStandard: "Daily values in UTC",
    license: "NASA open data; attribution requested",
    sourceUrl: "https://power.larc.nasa.gov/api/temporal/daily/point",
    retrievedAt: "2026-11-21T12:01:00.000Z",
  },
} as const satisfies Record<string, WeatherSource>;

function createDays(startDate: string, endDate: string, precipitationMm = 12): WeatherDay[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Array.from({ length: Math.round((end - start) / 86_400_000) + 1 }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    precipitationMm,
    et0Mm: 4,
    temperatureMeanCelsius: 18,
    temperatureMinCelsius: 12,
    temperatureMaxCelsius: 24,
    solarRadiationMjPerM2: null,
  }));
}

function prediction(value: number) {
  return { q05: value - 1, q50: value, q95: value + 1 };
}

function soilLayer(topDepthCm: number, bottomDepthCm: number): SoilProfileLayer {
  return {
    topDepthCm,
    bottomDepthCm,
    sandPercent: prediction(60),
    siltPercent: prediction(25),
    clayPercent: prediction(15),
    soilOrganicCarbonGramsPerKilogram: prediction(12),
    ph: prediction(6.2),
    bulkDensityKilogramsPerCubicDecimeter: prediction(1.4),
    waterContent10KpaPercent: prediction(40),
    waterContent33KpaPercent: prediction(30),
    waterContent1500KpaPercent: prediction(10),
  };
}

const completeSoilLayers = [
  soilLayer(0, 5),
  soilLayer(5, 15),
  soilLayer(15, 30),
  soilLayer(30, 60),
  soilLayer(60, 100),
  soilLayer(100, 200),
] as const;

function parcelLocator(): ParcelLocator {
  return {
    async findByIdentifier() {
      return {
        identifier: "141211_2.0038.102",
        parcelNumber: "102",
        geometry: {
          type: "Polygon" as const,
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
        administrativeArea: {
          voivodeship: "mazowieckie",
          county: "powiat miński",
          commune: "Mińsk Mazowiecki",
          cadastralDistrict: "Tartak",
        },
        provenance: {
          provider: "GUGiK ULDK" as const,
          datasource: "powiat miński (wfs)",
          retrievedAt: "2026-11-21T11:00:00.000Z",
        },
      };
    },
    async findByPoint() {
      return null;
    },
  };
}

function soilProvider(layers: SoilProfileLayer[] = [...completeSoilLayers]): SoilProfileProvider {
  return {
    async getProfile() {
      return {
        layers: layers as [
          SoilProfileLayer,
          SoilProfileLayer,
          SoilProfileLayer,
          SoilProfileLayer,
          SoilProfileLayer,
          SoilProfileLayer,
        ],
        retrievedAt: "2026-11-21T12:00:00.000Z",
        sourceUrl: "https://maps.isric.org/mapserv",
      };
    },
  };
}

function weatherProvider(
  source: WeatherSource = sources.openMeteo,
  behavior?: (startDate: string, endDate: string, days: WeatherDay[]) => WeatherDay[],
): WeatherConditionsProvider {
  return {
    async getDaily(_longitude, _latitude, startDate, endDate) {
      const days = createDays(startDate, endDate);
      return { days: behavior?.(startDate, endDate, days) ?? days, source };
    },
  };
}

const payload = {
  parcel: { type: "identifier" as const, identifier: "141211_2.0038.102" },
  crop: "pszenica-zwyczajna-jara" as const,
  analysisDate: "2025-06-30",
  phenology: {
    method: "explicit-scenarios" as const,
    scenarios: [
      {
        id: "declared-spring-season",
        seasonStartDate: "2025-03-20",
        durations: {
          initialDays: 20,
          developmentDays: 35,
          midSeasonDays: 50,
          lateSeasonDays: 30,
        },
        initialRootDepthMeters: 0.2,
        source: "user-supplied" as const,
        description: "Farmer-declared season",
      },
    ],
  },
  wettingTiming: "early-day" as const,
};

async function testApp(
  options: {
    soilProfileProvider?: SoilProfileProvider;
    weatherPrimaryProvider?: WeatherConditionsProvider;
    weatherFallbackProvider?: WeatherConditionsProvider;
  } = {},
) {
  const app = await createApp({
    database,
    logger: false,
    clock: () => new Date("2026-11-21T12:00:00.000Z"),
    parcelLocator: parcelLocator(),
    soilProfileProvider: options.soilProfileProvider ?? soilProvider(),
    weatherPrimaryProvider: options.weatherPrimaryProvider ?? weatherProvider(),
    weatherFallbackProvider: options.weatherFallbackProvider ?? weatherProvider(sources.nasa),
  });
  openApps.push(app);
  return app;
}

describe("POST /api/historical-analyses", () => {
  it.each(["seradela-uprawna", "seradela-uprawna-na-zielony-nawoz", "trawy-na-gruntach-ornych"])(
    "calculates ten seasons for the estimated %s profile",
    async (crop) => {
      const app = await testApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/historical-analyses",
        payload: { ...payload, crop, phenology: undefined },
      });
      expect(response.statusCode).toBe(200);
      const result = HistoricalWaterAssessmentResponseSchema.parse(response.json());
      expect(result.crop).toMatchObject({
        arimrId: crop,
        modelKind: "approximate",
        supported: true,
      });
      expect(result.crop.profileAssumptions?.join(" ")).toContain("Project group estimate");
      expect(result.summary.completeSeasonCount).toBe(10);
      expect(result.seasons.every((season) => season.scenarios.completeCount > 0)).toBe(true);
    },
  );

  it("returns ten complete prior seasons with a validated additive contract", async () => {
    const primary = weatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const soil = soilProvider();
    soil.getProfile = vi.fn(soil.getProfile);
    const app = await testApp({ weatherPrimaryProvider: primary, soilProfileProvider: soil });

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(HistoricalWaterAssessmentResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      status: "complete",
      referenceYears: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
      soil: { status: "complete", reusedForAllSeasons: true },
      summary: {
        requiredSeasonCount: 10,
        completeSeasonCount: 10,
        incompleteSeasonCount: 0,
      },
    });
    expect(body.seasons).toHaveLength(10);
    expect(
      body.seasons.every(
        ({ weather }: { weather: { source: WeatherSource } }) =>
          weather.source.provider === "Open-Meteo",
      ),
    ).toBe(true);
    expect(primary.getDaily).toHaveBeenCalledTimes(10);
    expect(soil.getProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps one failed year as a partial result and exposes timeout and rate-limit attempts", async () => {
    const primary = weatherProvider();
    primary.getDaily = vi.fn(async (longitude, latitude, startDate, endDate, signal) => {
      if (startDate.startsWith("2021-")) {
        throw new WeatherConditionsProviderError("RATE_LIMITED");
      }
      return weatherProvider().getDaily(longitude, latitude, startDate, endDate, signal);
    });
    const fallback = weatherProvider(sources.nasa);
    fallback.getDaily = vi.fn(async (longitude, latitude, startDate, endDate, signal) => {
      if (startDate.startsWith("2021-")) {
        throw new WeatherConditionsProviderError("TIMEOUT");
      }
      return weatherProvider(sources.nasa).getDaily(
        longitude,
        latitude,
        startDate,
        endDate,
        signal,
      );
    });
    const app = await testApp({
      weatherPrimaryProvider: primary,
      weatherFallbackProvider: fallback,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload,
    });
    const body = response.json();
    const failed = body.seasons.find(
      ({ referenceYear }: { referenceYear: number }) => referenceYear === 2021,
    );

    expect(response.statusCode).toBe(200);
    expect(body.summary).toMatchObject({ completeSeasonCount: 9, incompleteSeasonCount: 1 });
    expect(body.summary.stressOccurrence.denominator).toBe(9);
    expect(failed).toMatchObject({
      status: "incomplete",
      conclusion: "unavailable",
      weather: {
        status: "unavailable",
        attempts: [
          { providerRole: "primary", outcome: "failed", errorCode: "RATE_LIMITED" },
          { providerRole: "fallback", outcome: "failed", errorCode: "TIMEOUT" },
        ],
      },
    });
    expect(failed.incompleteReasonCodes).toContain("WEATHER_UNAVAILABLE");
  });

  it("falls back for an entire season and never splices providers", async () => {
    const primary = weatherProvider(sources.openMeteo, (_start, _end, days) =>
      days.map((day, index) => (index === 3 ? { ...day, et0Mm: null } : day)),
    );
    const fallback = weatherProvider(sources.nasa);
    const app = await testApp({
      weatherPrimaryProvider: primary,
      weatherFallbackProvider: fallback,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("complete");
    expect(
      body.seasons.every(
        ({ weather }: { weather: { source: WeatherSource } }) =>
          weather.source.provider === "NASA POWER",
      ),
    ).toBe(true);
    expect(body.seasons[0].weather.attempts).toEqual([
      { providerRole: "primary", outcome: "partial" },
      { providerRole: "fallback", outcome: "complete" },
    ]);
  });

  it("does not splice complementary partial provider responses", async () => {
    const primary = weatherProvider(sources.openMeteo, (_start, _end, days) =>
      days.map((day, index) => (index === 2 ? { ...day, precipitationMm: null } : day)),
    );
    const fallback = weatherProvider(sources.nasa, (_start, _end, days) =>
      days.map((day, index) => (index === 4 ? { ...day, et0Mm: null } : day)),
    );
    const app = await testApp({
      weatherPrimaryProvider: primary,
      weatherFallbackProvider: fallback,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("insufficient-data");
    expect(body.summary.completeSeasonCount).toBe(0);
    expect(body.seasons[0]).toMatchObject({
      status: "incomplete",
      weather: {
        status: "partial",
        source: { provider: "NASA POWER" },
      },
    });
  });

  it("preserves the cross-year relationship for winter seasons", async () => {
    const primary = weatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await testApp({ weatherPrimaryProvider: primary });
    const winterPayload = {
      ...payload,
      crop: "pszenica-zwyczajna-ozima",
      analysisDate: "2025-03-15",
      phenology: {
        method: "explicit-scenarios",
        scenarios: [
          {
            id: "winter-season",
            seasonStartDate: "2024-10-15",
            durations: {
              initialDays: 120,
              developmentDays: 40,
              midSeasonDays: 35,
              lateSeasonDays: 25,
            },
            initialRootDepthMeters: 0.2,
            source: "local-observation",
            description: "Observed autumn emergence",
          },
        ],
      },
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: winterPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().seasons[0]).toMatchObject({
      referenceYear: 2024,
      periodStartDate: "2023-10-15",
      periodEndDate: "2024-03-15",
    });
    expect(primary.getDaily).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "2023-10-15",
      "2024-03-15",
      undefined,
    );
  });

  it("does not simulate historical plant roots for mushrooms", async () => {
    const primary = weatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await testApp({ weatherPrimaryProvider: primary });

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: { ...payload, crop: "pieczarka" },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: "insufficient-data",
      crop: { supported: false, profileId: null },
      summary: { completeSeasonCount: 0, incompleteSeasonCount: 10 },
    });
    expect(body.seasons[0].incompleteReasonCodes).toContain("CROP_PROFILE_UNSUPPORTED");
    expect(body.seasons[0].incompleteReasonCodes).not.toContain("WEATHER_UNAVAILABLE");
    expect(primary.getDaily).not.toHaveBeenCalled();
  });

  it("uses the documented project-standard phenology when none is supplied", async () => {
    const app = await testApp();
    const { phenology: _phenology, ...withoutPhenology } = payload;

    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: withoutPhenology,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      phenology: {
        basis: "project-standard",
        seasonStartDates: ["2025-03-25"],
      },
      summary: { requiredSeasonCount: 10, completeSeasonCount: 10 },
    });
  });

  it("propagates request cancellation to an in-flight season provider", async () => {
    const controller = new AbortController();
    const primary: WeatherConditionsProvider = {
      async getDaily(_longitude, _latitude, _startDate, _endDate, signal) {
        signal?.throwIfAborted();
        throw new Error("Expected an aborted request.");
      },
    };
    controller.abort();

    await expect(
      createHistoricalWaterAssessment(
        payload,
        {
          parcelLocator: parcelLocator(),
          soilProfileProvider: soilProvider(),
          weatherPrimaryProvider: primary,
          weatherFallbackProvider: weatherProvider(sources.nasa),
          clock: () => new Date("2026-11-21T12:00:00.000Z"),
          logger: { warn: vi.fn() },
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("historical phenology completeness", () => {
  it("does not count years as complete after dropping an ended phenology alternative", async () => {
    const app = await testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: { ...payload, crop: "ziemniak", analysisDate: "2025-09-01", phenology: undefined },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      summary: { completeSeasonCount: 0, incompleteSeasonCount: 10 },
    });
    for (const season of response.json().seasons) {
      expect(season.scenarios.completeCount).toBeLessThan(season.scenarios.totalCount);
      expect(season.incompleteReasonCodes).toContain("ANALYSIS_AFTER_MODELED_SEASON");
    }
  });
});

describe("historical soil requirements", () => {
  it("does not report missing required soil values below the simulated crop root zone", async () => {
    const layers = completeSoilLayers.map((layer) => ({ ...layer }));
    const deepest = layers.at(-1);
    if (!deepest) throw new Error("Missing deepest fixture layer");
    deepest.waterContent10KpaPercent = { q05: null, q50: null, q95: null };
    deepest.waterContent33KpaPercent = { q05: null, q50: null, q95: null };
    deepest.waterContent1500KpaPercent = { q05: null, q50: null, q95: null };
    const app = await testApp({ soilProfileProvider: soilProvider(layers) });
    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: { ...payload, crop: "ziemniak" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().summary.completeSeasonCount).toBe(10);
    for (const season of response.json().seasons) {
      expect(season.incompleteReasonCodes).not.toContain("SOIL_PROFILE_INCOMPLETE");
    }
  });
});

describe("winter rapeseed reference history", () => {
  it("calculates all ten seasons instead of stopping at missing reference phenology", async () => {
    const app = await testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: {
        ...payload,
        crop: "rzepak-ozimy",
        analysisDate: "2025-05-15",
        phenology: undefined,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      summary: { completeSeasonCount: 10 },
      phenology: { referenceSource: { provider: "INRAE" } },
    });
  });
});

describe("post-season faba bean history", () => {
  it("calculates ten analogous completed periods for a November request", async () => {
    const app = await testApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/historical-analyses",
      payload: { ...payload, crop: "bobik", analysisDate: "2025-11-21", phenology: undefined },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analysisDate: "2025-11-21",
      evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-07-02" },
      crop: { profileId: "faba-bean" },
      summary: { completeSeasonCount: 10 },
    });
    expect(response.json().seasons[0].periodEndDate).toBe("2024-07-02");
  });
});

describe("reviewed crop history", () => {
  it.each([
    ["zyto-jare", "spring-rye", "Stage lengths use"],
    ["zyto-ozime", "winter-rye", "Stage lengths use"],
    ["jeczmien-ozimy", "winter-barley", "Stage lengths use"],
    ["rzepak-jary", "spring-rapeseed", "COBORU"],
    ["gryka-zwyczajna", "buckwheat", "Stage lengths use"],
    ["truskawka", "strawberry", "Stage lengths use"],
    ["pszenzyto-jare", "spring-wheat", "triticale proxy"],
    ["pszenzyto-ozime", "winter-wheat", "triticale proxy"],
    ["kukurydza-na-kiszonke", "silage-maize", "2025"],
    ["pszenica-orkisz-ozimy", "winter-wheat", "not species-specific calibration"],
  ])(
    "preserves the mapping assumptions in ten-year history for %s",
    async (crop, profileId, basis) => {
      const app = await testApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/historical-analyses",
        payload: { ...payload, crop, analysisDate: "2025-06-15", phenology: undefined },
      });
      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.crop).toMatchObject({ supported: true, profileId });
      expect(result.crop.profileAssumptions.join(" ")).toContain(basis);
      expect(result.seasons).toHaveLength(10);
      if (profileId === "winter-wheat") {
        const reference = await app.inject({
          method: "POST",
          url: "/api/historical-analyses",
          payload: {
            ...payload,
            crop: "pszenica-zwyczajna-ozima",
            analysisDate: "2025-06-15",
            phenology: undefined,
          },
        });
        expect(result.summary).toEqual(reference.json().summary);
        expect(result.seasons).toEqual(reference.json().seasons);
      } else {
        expect(result.summary.completeSeasonCount).toBe(10);
      }
    },
  );
});
