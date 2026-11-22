import { ARIMR_CROP_PROFILE_MAPPINGS } from "@kowr/analysis";
import type { WeatherDay, WeatherSource } from "@kowr/contracts";
import { CROP_CATALOG } from "@kowr/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import type { SatelliteHistoryProvider } from "../satellite-history/satellite-history-provider.js";
import { SatelliteHistoryProviderError } from "../satellite-history/satellite-history-provider.js";
import type {
  SoilProfileLayer,
  SoilProfileProvider,
} from "../soil-profiles/soil-profile-provider.js";
import type { WeatherConditionsProvider } from "../weather-conditions/weather-conditions-provider.js";
import { WeatherConditionsProviderError } from "../weather-conditions/weather-conditions-provider.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

const weatherSources = {
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

function createDays(
  startDate: string,
  endDate: string,
  modify?: (day: WeatherDay, index: number) => WeatherDay,
): WeatherDay[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Array.from({ length: Math.round((end - start) / 86_400_000) + 1 }, (_, index) => {
    const day: WeatherDay = {
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      precipitationMm: 20,
      et0Mm: 3,
      temperatureMeanCelsius: 18,
      temperatureMinCelsius: 12,
      temperatureMaxCelsius: 24,
      solarRadiationMjPerM2: null,
    };
    return modify?.(day, index) ?? day;
  });
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

function createParcelLocator(): ParcelLocator {
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

function createSoilProvider(
  layers: SoilProfileLayer[] = [...completeSoilLayers],
): SoilProfileProvider {
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

function createWeatherProvider(
  source: WeatherSource = weatherSources.openMeteo,
  modify?: (days: WeatherDay[]) => WeatherDay[],
): WeatherConditionsProvider {
  return {
    async getDaily(_longitude, _latitude, startDate, endDate) {
      const days = createDays(startDate, endDate);
      return { days: modify?.(days) ?? days, source };
    },
  };
}

function unavailableSatelliteProvider(): SatelliteHistoryProvider {
  const unavailable = async () => {
    throw new SatelliteHistoryProviderError("NOT_CONFIGURED");
  };
  return {
    getFrame: unavailable,
    getHistory: unavailable,
    getObservationSeries: unavailable,
  };
}

function qualifiedDecreasingSatelliteProvider(): SatelliteHistoryProvider {
  const base = unavailableSatelliteProvider();
  return {
    ...base,
    async getObservationSeries() {
      const dates = ["2025-05-10", "2025-05-22", "2025-06-03", "2025-06-15", "2025-06-28"];
      return {
        status: "complete",
        limitations: [],
        observations: dates.map((date, index) => ({
          id: `sentinel-${index}`,
          date,
          acquiredAt: `${date}T10:00:00Z`,
          sceneCloudPercent: 5,
          indicators: {
            ndmi: {
              median: 0.5 - index * 0.08,
              validPixelPercent: 90,
              quality: {
                assessment: "sufficient" as const,
                geometryPixelCount: 100,
                thresholdPercent: 70,
                validPixelCount: 90,
                rejectedPixelCounts: null,
              },
            },
            ndvi: { median: 0.7, validPixelPercent: 90, quality: null },
          },
        })),
        provenance: {
          collection: "sentinel-2-l2a" as const,
          license: "Contains modified Copernicus Sentinel data",
          provider: "Copernicus Data Space Ecosystem" as const,
          retrievedAt: "2026-11-21T12:00:00Z",
          sourceUrl: "https://dataspace.copernicus.eu/",
        },
      };
    },
  };
}

const basePayload = {
  parcel: { type: "identifier" as const, identifier: "141211_2.0038.102" },
  crop: "pszenica-zwyczajna-jara" as const,
  analysisDate: "2025-06-30",
  phenology: {
    method: "fao56-reference" as const,
    seasonStartDates: ["2025-03-20"],
    initialRootDepthMeters: 0.2,
  },
  wettingTiming: "early-day" as const,
};

async function createTestApp(
  options: {
    clock?: () => Date;
    parcelLocator?: ParcelLocator;
    soilProfileProvider?: SoilProfileProvider;
    weatherPrimaryProvider?: WeatherConditionsProvider;
    weatherFallbackProvider?: WeatherConditionsProvider;
    satelliteHistoryProvider?: SatelliteHistoryProvider;
  } = {},
) {
  const app = await createApp({
    database,
    logger: false,
    clock: options.clock ?? (() => new Date("2026-11-21T12:00:00.000Z")),
    parcelLocator: options.parcelLocator ?? createParcelLocator(),
    soilProfileProvider: options.soilProfileProvider ?? createSoilProvider(),
    weatherPrimaryProvider: options.weatherPrimaryProvider ?? createWeatherProvider(),
    weatherFallbackProvider:
      options.weatherFallbackProvider ?? createWeatherProvider(weatherSources.nasa),
    satelliteHistoryProvider: options.satelliteHistoryProvider ?? unavailableSatelliteProvider(),
  });
  openApps.push(app);
  return app;
}

describe("POST /api/analyses", () => {
  it.each(["seradela-uprawna", "trawy-na-gruntach-ornych", "gryka-tatarka", "mieszanka-zbozowa"])(
    "calculates %s using an explicitly approximate model instead of rejecting missing FAO parameters",
    async (crop) => {
      const app = await createTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/analyses",
        payload: { ...basePayload, crop, phenology: undefined },
      });
      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.crop).toMatchObject({
        arimrId: crop,
        modelKind: "approximate",
        supported: true,
      });
      expect(result.crop.profileAssumptions.join(" ")).toContain("Project group estimate");
      expect(result.reasonCodes).not.toContain("CROP_PROFILE_UNSUPPORTED");
      expect(result.scenarios.completeCount).toBeGreaterThan(0);
      expect(result.scenarios.completeCount).toBe(result.scenarios.totalCount);
    },
  );

  it("fetches the complete spring season and returns report-ready metadata", async () => {
    const primary = createWeatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await createTestApp({ weatherPrimaryProvider: primary });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      analysisDate: "2025-06-30",
      crop: { profileId: "spring-wheat", supported: true },
      phenology: { status: "ready", scenarioCount: 1, activeScenarioCount: 1 },
      weather: {
        status: "complete",
        purpose: "fao56-season",
        period: { startDate: "2025-03-20", endDate: "2025-06-30", expectedDayCount: 103 },
        precipitationAvailableDayCount: 103,
        et0AvailableDayCount: 103,
        source: { provider: "Open-Meteo" },
      },
      soil: { status: "complete", usableWaterLayerCount: 6 },
      balance: { classification: "no-significant-shortage-indications" },
    });
    expect(response.json().scenarios.totalCount).toBeGreaterThan(0);
    expect(response.json().scenarios.completeCount).toBe(response.json().scenarios.totalCount);
    expect(response.json().sources.map(({ kind }: { kind: string }) => kind)).toEqual([
      "parcel",
      "weather",
      "soil",
    ]);
    expect(primary.getDaily).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "2025-03-20",
      "2025-06-30",
      undefined,
    );
  });

  it("uses the minimal SoilGrids water profile when the provider supports it", async () => {
    const fullProvider = createSoilProvider();
    const getProfile = vi.fn(fullProvider.getProfile);
    const getWaterProfile = vi.fn(fullProvider.getProfile);
    const app = await createTestApp({
      soilProfileProvider: { getProfile, getWaterProfile },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      soil: { status: "complete", usableWaterLayerCount: 6 },
    });
    expect(getWaterProfile).toHaveBeenCalledOnce();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("supports a historical winter season across a calendar-year boundary", async () => {
    const primary = createWeatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await createTestApp({ weatherPrimaryProvider: primary });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        crop: "pszenica-zwyczajna-ozima",
        analysisDate: "2025-03-15",
        phenology: {
          method: "explicit-scenarios",
          scenarios: [
            {
              id: "observed-winter-season",
              seasonStartDate: "2024-10-15",
              durations: {
                initialDays: 120,
                developmentDays: 40,
                midSeasonDays: 35,
                lateSeasonDays: 25,
              },
              initialRootDepthMeters: 0.2,
              source: "local-observation",
              description: "Observed autumn emergence date",
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().weather.period).toMatchObject({
      startDate: "2024-10-15",
      endDate: "2025-03-15",
    });
    expect(response.json().limitations).toContain("HISTORICAL_CROP_NOT_CONFIRMED");
    expect(primary.getDaily).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "2024-10-15",
      "2025-03-15",
      undefined,
    );
  });

  it("does not fill missing ET0 and reports an incomplete season", async () => {
    const withoutEt0 = createWeatherProvider(weatherSources.openMeteo, (days) =>
      days.map((day, index) => (index === 10 ? { ...day, et0Mm: null } : day)),
    );
    const fallbackWithoutEt0 = createWeatherProvider(weatherSources.nasa, (days) =>
      days.map((day, index) => (index === 10 ? { ...day, et0Mm: null } : day)),
    );
    const app = await createTestApp({
      weatherPrimaryProvider: withoutEt0,
      weatherFallbackProvider: fallbackWithoutEt0,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      weather: {
        status: "partial",
        et0AvailableDayCount: 102,
        completeDayCount: 102,
        missingDays: [{ date: "2025-03-30", fields: ["et0"] }],
        latestContiguousCompleteDate: "2025-03-29",
        latestCompleteAssessmentDate: "2025-03-29",
      },
      balance: { classification: "insufficient-data" },
    });
    expect(response.json().reasonCodes).toContain("WEATHER_SERIES_INCOMPLETE");
    expect(response.json().scenarios.results[0].issues[0]).toMatchObject({
      code: "MISSING_WEATHER_VALUE",
      field: "referenceEvapotranspirationMm",
    });
  });

  it("does not fill a missing precipitation day", async () => {
    const missingDay = (days: WeatherDay[]) => days.filter((_, index) => index !== 5);
    const app = await createTestApp({
      weatherPrimaryProvider: createWeatherProvider(weatherSources.openMeteo, missingDay),
      weatherFallbackProvider: createWeatherProvider(weatherSources.nasa, missingDay),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      weather: {
        status: "partial",
        precipitationAvailableDayCount: 102,
        missingDays: [{ date: "2025-03-25", fields: ["precipitation", "et0"] }],
        latestContiguousCompleteDate: "2025-03-24",
      },
    });
    expect(response.json().scenarios.results[0].issues[0].code).toBe("MISSING_WEATHER_VALUE");
  });

  it("reports a partial SoilGrids water profile as insufficient core data", async () => {
    const partialLayers = completeSoilLayers.map((layer) => ({ ...layer }));
    const firstLayer = partialLayers[0];
    if (!firstLayer) throw new Error("Missing test soil layer");
    firstLayer.waterContent33KpaPercent = { q05: null, q50: null, q95: null };
    const app = await createTestApp({ soilProfileProvider: createSoilProvider(partialLayers) });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      assessmentLevel: "limited-fao56",
      dataAvailability: "partial",
      availableScenarioConclusion: "consistent-no-stress",
      soil: { status: "partial", usableWaterLayerCount: 5 },
    });
    expect(response.json().reasonCodes).toContain("SOIL_PROFILE_INCOMPLETE");
    expect(response.json().scenarios.families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldCapacity: "10-kpa", status: "complete" }),
        expect.objectContaining({ fieldCapacity: "33-kpa", status: "unavailable" }),
      ]),
    );
  });

  it("does not require a deep SoilGrids layer below the crop root zone", async () => {
    const partialLayers = completeSoilLayers.map((layer) => ({ ...layer }));
    const deepestLayer = partialLayers.at(-1);
    if (!deepestLayer) throw new Error("Missing deepest test soil layer");
    deepestLayer.waterContent10KpaPercent = { q05: null, q50: null, q95: null };
    deepestLayer.waterContent33KpaPercent = { q05: null, q50: null, q95: null };
    deepestLayer.waterContent1500KpaPercent = { q05: null, q50: null, q95: null };
    const app = await createTestApp({ soilProfileProvider: createSoilProvider(partialLayers) });

    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, crop: "ziemniak", phenology: undefined },
    });

    expect(response.json()).toMatchObject({
      status: "complete",
      assessmentLevel: "full-fao56",
      soil: { status: "partial", usableWaterLayerCount: 5 },
    });
    expect(response.json().reasonCodes).not.toContain("SOIL_PROFILE_INCOMPLETE");
  });

  it("returns environmental context for mushrooms rather than inventing plant roots", async () => {
    const primary = createWeatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await createTestApp({ weatherPrimaryProvider: primary });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, crop: "pieczarka", phenology: undefined },
    });

    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      crop: { profileId: null, supported: false },
      phenology: { status: "unsupported-crop" },
      weather: {
        purpose: "analysis-day-context",
        period: { startDate: "2025-06-01", endDate: "2025-06-30", expectedDayCount: 30 },
      },
      scenarios: { totalCount: 0 },
    });
    expect(response.json().reasonCodes).toContain("CROP_PROFILE_UNSUPPORTED");
  });

  it("uses the documented project-standard phenology for a supported crop", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, phenology: undefined },
    });

    expect(response.json()).toMatchObject({
      status: "complete",
      phenology: {
        status: "ready",
        scenarioCount: 1,
        basis: "project-standard",
        seasonStartDates: ["2025-03-25"],
      },
      weather: { purpose: "fao56-season" },
    });
    expect(response.json().reasonCodes).not.toContain("PHENOLOGY_REQUIRED");
  });

  it("explicitly evaluates the completed period when the supplied season has ended", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        analysisDate: "2025-10-01",
        phenology: {
          method: "fao56-reference",
          seasonStartDates: ["2025-03-20"],
          initialRootDepthMeters: 0.2,
        },
      },
    });

    const result = response.json();
    expect(response.statusCode).toBe(200);
    expect(result).toMatchObject({
      analysisDate: "2025-10-01",
      evaluation: { scope: "analysis-day", evaluatedThroughDate: "2025-10-01" },
      balance: { classification: "insufficient-data" },
      weather: { purpose: "analysis-day-context", period: { endDate: "2025-10-01" } },
      requestedDateConditions: { date: "2025-10-01", cropAssessment: "outside-modelled-season" },
      completedSeason: {
        evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-08-01" },
        weather: { purpose: "fao56-season", period: { endDate: "2025-08-01" } },
      },
    });
    expect(result.scenarios.completeCount).toBe(result.scenarios.totalCount);
    expect(result.completedSeason.scenarios.completeCount).toBeGreaterThan(0);
    expect(result.completedSeason.reasonCodes).not.toContain("ANALYSIS_OUTSIDE_MODELED_SEASON");
  });

  it("keeps contradictory initial-state scenarios indeterminate", async () => {
    const dryWeather = createWeatherProvider(weatherSources.openMeteo, (days) =>
      days.map((day) => ({ ...day, precipitationMm: 0, et0Mm: 4 })),
    );
    const app = await createTestApp({ weatherPrimaryProvider: dryWeather });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        analysisDate: "2025-04-01",
        phenology: {
          method: "explicit-scenarios",
          scenarios: [
            {
              id: "known-start",
              seasonStartDate: "2025-04-01",
              durations: {
                initialDays: 5,
                developmentDays: 5,
                midSeasonDays: 5,
                lateSeasonDays: 5,
              },
              initialRootDepthMeters: 0.2,
              source: "user-supplied",
              description: "User supplied emergence date",
            },
          ],
        },
      },
    });

    expect(response.json()).toMatchObject({
      status: "indeterminate",
      balance: { classification: "indeterminate", scenarioConsensus: "scenario-disagreement" },
    });
    expect(response.json().reasonCodes).toContain("SCENARIO_CONCLUSIONS_DISAGREE");
  });

  it("does not let satellite unavailability alter a complete FAO-56 result", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, includeSatellite: true },
    });

    expect(response.json()).toMatchObject({
      status: "complete",
      balance: { classification: "no-significant-shortage-indications" },
      satellite: {
        status: "unavailable",
        consistency: "unavailable",
        reason: "provider-unavailable",
      },
    });
    expect(response.json().reasonCodes).toContain("SATELLITE_UNAVAILABLE");
  });

  it("reports a qualified satellite conflict without changing the FAO-56 class", async () => {
    const app = await createTestApp({
      satelliteHistoryProvider: qualifiedDecreasingSatelliteProvider(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, includeSatellite: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "complete",
      balance: { classification: "no-significant-shortage-indications" },
      satellite: {
        status: "available",
        signal: "pattern-compatible-with-shortage",
        consistency: "conflicts-with-balance",
        limitsInterpretation: true,
        interpretationReason: "decreasing-mid-season-ndmi",
        observationDate: "2025-06-28",
      },
    });
  });

  it("falls back with the entire season after an Open-Meteo failure", async () => {
    const primary: WeatherConditionsProvider = {
      async getDaily() {
        throw new WeatherConditionsProviderError("RATE_LIMITED");
      },
    };
    const fallback = createWeatherProvider(weatherSources.nasa);
    fallback.getDaily = vi.fn(fallback.getDaily);
    const app = await createTestApp({
      weatherPrimaryProvider: primary,
      weatherFallbackProvider: fallback,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.json().weather).toMatchObject({
      status: "complete",
      source: { provider: "NASA POWER" },
      attempts: [
        { providerRole: "primary", outcome: "failed" },
        { providerRole: "fallback", outcome: "complete" },
      ],
    });
    expect(fallback.getDaily).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "2025-03-20",
      "2025-06-30",
      undefined,
    );
    expect(response.json().limitations).toContain("WEATHER_FALLBACK_TIME_STANDARD_DIFFERS");
  });

  it("returns a partial response when both weather APIs fail", async () => {
    const unavailable: WeatherConditionsProvider = {
      async getDaily() {
        throw new WeatherConditionsProviderError("REQUEST_FAILED");
      },
    };
    const app = await createTestApp({
      weatherPrimaryProvider: unavailable,
      weatherFallbackProvider: unavailable,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      weather: { status: "unavailable", source: null },
      balance: { classification: "insufficient-data" },
    });
    expect(response.json().reasonCodes).toContain("WEATHER_UNAVAILABLE");
  });

  it("rejects future dates before calling data providers", async () => {
    const primary = createWeatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await createTestApp({ weatherPrimaryProvider: primary });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, analysisDate: "2026-11-22" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("ANALYSIS_DATE_IN_FUTURE");
    expect(primary.getDaily).not.toHaveBeenCalled();
  });

  it("uses the public error contract for invalid requests", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, unexpected: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "The request payload is invalid." },
    });
  });
});

describe("assessment completeness regressions", () => {
  it("retains an ended phenology alternative as an incomplete required family", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        crop: "ziemniak",
        analysisDate: "2025-09-01",
        phenology: undefined,
      },
    });
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.phenology).toMatchObject({
      status: "partially-active",
      scenarioCount: 2,
      activeScenarioCount: 1,
    });
    expect(result.assessmentLevel).toBe("limited-fao56");
    expect(result.balance.classification).toBe("insufficient-data");
    expect(result.scenarios.completeCount).toBeLessThan(result.scenarios.totalCount);
    expect(
      result.scenarios.families.some(
        (family: { status: string }) => family.status === "unavailable",
      ),
    ).toBe(true);
    expect(result.reasonCodes).toContain("REQUIRED_SCENARIO_INCOMPLETE");
  });

  it("returns the balance when the optional satellite provider does not finish", async () => {
    let satelliteSignal: AbortSignal | undefined;
    const provider = unavailableSatelliteProvider();
    provider.getObservationSeries = vi.fn<SatelliteHistoryProvider["getObservationSeries"]>(
      (_geometry, _from, _through, signal) => {
        satelliteSignal = signal;
        return new Promise(() => {});
      },
    );
    const app = await createTestApp({ satelliteHistoryProvider: provider });
    vi.useFakeTimers();
    try {
      const responsePromise = app
        .inject({
          method: "POST",
          url: "/api/analyses",
          payload: { ...basePayload, includeSatellite: true },
        })
        .then((response) => response);
      await vi.waitFor(() => expect(provider.getObservationSeries).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(8_000);
      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        assessmentLevel: "full-fao56",
        satellite: { status: "unavailable", reason: "provider-unavailable" },
      });
      expect(satelliteSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("partial weather context", () => {
  it("keeps observed weather available when ET0 is absent for the whole season", async () => {
    const withoutEt0 = createWeatherProvider(weatherSources.openMeteo, (days) =>
      days.map((day) => ({ ...day, et0Mm: null })),
    );
    const app = await createTestApp({
      weatherPrimaryProvider: withoutEt0,
      weatherFallbackProvider: withoutEt0,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: basePayload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      dataAvailability: "partial",
      weather: {
        status: "partial",
        precipitationAvailableDayCount: 103,
        et0AvailableDayCount: 0,
        completeDayCount: 0,
      },
      balance: { classification: "insufficient-data" },
    });
  });
});

describe("automatic winter rapeseed", () => {
  it("computes the crop suggested for parcel 280903_2.0009.1/25 with sourced reference phases", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        crop: "rzepak-ozimy",
        analysisDate: "2025-05-15",
        phenology: undefined,
      },
    });
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.assessmentLevel).toBe("full-fao56");
    expect(result.phenology).toMatchObject({
      status: "ready",
      referenceSource: { provider: "INRAE", version: "0.3.0" },
    });
    expect(result.scenarios.completeCount).toBe(result.scenarios.totalCount);
    expect(result.scenarios.results[0].configuration.phenologySource).toBe(
      "project-adapted-reference",
    );
    expect(result.limitations).toContain("PHENOLOGY_NOT_POLAND_CALIBRATED");
  });
});

describe("faba bean reference assessment", () => {
  it.each(["2025-06-15", "2025-11-21"])(
    "returns a computed balance for bobik at %s",
    async (analysisDate) => {
      const app = await createTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/analyses",
        payload: { ...basePayload, crop: "bobik", analysisDate, phenology: undefined },
      });
      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.crop).toMatchObject({ supported: true, profileId: "faba-bean" });
      const season = result.completedSeason ?? result;
      expect(season.scenarios.completeCount).toBeGreaterThan(0);
      expect(season.scenarios.completeCount).toBe(season.scenarios.totalCount);
      expect(result.evaluation).toEqual({
        scope: "analysis-day",
        evaluatedThroughDate: analysisDate,
      });
      expect(result.weather.period.endDate).toBe(analysisDate);
      expect(season.limitations).toContain("PHENOLOGY_NOT_POLAND_CALIBRATED");
    },
  );
});

describe("catalog mapping boundary", () => {
  it("maps only existing catalog identifiers and assigns each identifier once", () => {
    const catalogIds = new Set<string>(CROP_CATALOG.map(({ id }) => id));
    const mappedIds = ARIMR_CROP_PROFILE_MAPPINGS.map(({ arimrCropId }) => arimrCropId);
    expect(mappedIds.every((id) => catalogIds.has(id))).toBe(true);
    expect(new Set(mappedIds).size).toBe(mappedIds.length);
  });
});

describe("requested-day assessment boundary", () => {
  it("accepts the current Polish day and leaves its unfinished daily totals missing", async () => {
    const primary = createWeatherProvider();
    primary.getDaily = vi.fn(primary.getDaily);
    const app = await createTestApp({
      weatherPrimaryProvider: primary,
      clock: () => new Date("2026-11-21T23:30:00Z"),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        crop: "pszenica-zwyczajna-ozima",
        analysisDate: "2026-11-22",
        phenology: undefined,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      analysisDate: "2026-11-22",
      status: "insufficient-data",
      evaluation: { scope: "analysis-day", evaluatedThroughDate: "2026-11-22" },
      requestedDateConditions: {
        date: "2026-11-22",
        ongoingDay: true,
        status: "partial",
        day: { precipitationMm: null, referenceEvapotranspirationMm: null },
      },
      weather: {
        latestContiguousCompleteDate: "2026-11-21",
        missingDays: [
          { date: "2026-11-22", fields: ["precipitation", "et0"], cause: "not-yet-published" },
        ],
      },
    });
    expect(primary.getDaily).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
      "2026-11-21",
      undefined,
    );
  });

  it("uses weather ending on the requested date separately from the completed crop season", async () => {
    const weather = createWeatherProvider(weatherSources.openMeteo, (days) =>
      days.map((day) => ({
        ...day,
        precipitationMm: day.date >= "2025-10-01" ? 0 : 20,
      })),
    );
    const app = await createTestApp({ weatherPrimaryProvider: weather });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        crop: "bobik",
        analysisDate: "2025-11-21",
        phenology: undefined,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      evaluation: { scope: "analysis-day", evaluatedThroughDate: "2025-11-21" },
      balance: { classification: "insufficient-data" },
      requestedDateConditions: {
        date: "2025-11-21",
        status: "complete",
        period: { startDate: "2025-10-23", endDate: "2025-11-21" },
        differenceMm: -90,
        signal: "precipitation-below-reference-et0",
      },
      completedSeason: {
        status: "complete",
        evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-07-02" },
        balance: { classification: "no-significant-shortage-indications" },
      },
    });
    expect(
      response.json().sources.find((source: { kind: string }) => source.kind === "weather").dataTo,
    ).toBe("2025-11-21");
  });

  it("retains seasonal context without reporting it as a successful requested-day assessment when recent weather fails", async () => {
    const provider = createWeatherProvider();
    const original = provider.getDaily;
    provider.getDaily = async (longitude, latitude, start, end, signal) => {
      if (start >= "2025-10-01") throw new WeatherConditionsProviderError("TIMEOUT");
      return original(longitude, latitude, start, end, signal);
    };
    const app = await createTestApp({
      weatherPrimaryProvider: provider,
      weatherFallbackProvider: provider,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: {
        ...basePayload,
        crop: "bobik",
        analysisDate: "2025-11-21",
        phenology: undefined,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "insufficient-data",
      assessmentLevel: "unavailable",
      requestedDateConditions: { status: "unavailable", source: null },
      completedSeason: { status: "complete" },
      weather: { status: "unavailable" },
    });
  });
});

describe("reviewed catalog extensions", () => {
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
    ["pszenica-orkisz-jary", "spring-wheat", "not species-specific calibration"],
    ["pszenica-orkisz-ozimy", "winter-wheat", "not species-specific calibration"],
    ["batat", "sweet-potato", "2025"],
    ["por", "leek", "Stage lengths use"],
    ["pasternak-zwyczajny", "parsnip", "Stage lengths use"],
    ["brukiew-pastewna", "rutabaga", "Stage lengths use"],
    ["rzepa-pastewna", "turnip", "Stage lengths use"],
    ["krokosz-barwierski", "safflower", "2025"],
  ])("computes %s with visible reference assumptions", async (crop, profileId, assumption) => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/analyses",
      payload: { ...basePayload, crop, analysisDate: "2025-06-15", phenology: undefined },
    });
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.crop).toMatchObject({ supported: true, profileId });
    expect(result.crop.profileAssumptions.join(" ")).toContain(assumption);
    expect(result.scenarios.completeCount).toBeGreaterThan(0);
    if (profileId === "winter-wheat") {
      const reference = await app.inject({
        method: "POST",
        url: "/api/analyses",
        payload: {
          ...basePayload,
          crop: "pszenica-zwyczajna-ozima",
          analysisDate: "2025-06-15",
          phenology: undefined,
        },
      });
      expect(result.scenarios).toEqual(reference.json().scenarios);
    } else {
      expect(result.scenarios.completeCount).toBe(result.scenarios.totalCount);
    }
    expect(result.limitations).toContain("PHENOLOGY_NOT_POLAND_CALIBRATED");
  });
});
