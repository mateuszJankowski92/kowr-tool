import {
  aggregateHistoricalWaterAssessment,
  buildReferencePhenologyScenarios,
  type Fao56PhenologyScenario,
  type Fao56SoilLayer,
  findCropWaterProfile,
  findCropWaterProfileIdForArimrCrop,
  findRepresentativeInteriorPoint,
  getCropModelCapability,
  getCropWaterProfileAssumptionsForArimrCrop,
  getStandardSeasonStartDate,
  type HistoricalSeasonPlan,
  type HistoricalSeasonSimulation,
  planAnalogousHistoricalSeasons,
  RAPESEED_PHENOLOGY_REFERENCE_SOURCE,
  resolveCropAssessmentPeriod,
  shiftCalendarDateByYears,
  simulateFao56Season,
} from "@kowr/analysis";
import type {
  HistoricalWaterAssessmentRequest,
  HistoricalWaterAssessmentResponse,
  SoilProfileResponse,
} from "@kowr/contracts";
import type { FastifyBaseLogger } from "fastify";
import {
  AnalysisDateInFutureError,
  AnalysisLocationUnavailableError,
} from "../analyses/analysis.errors.js";
import { analysisCalendarDate } from "../analyses/analysis-calendar.js";
import {
  type ContinuousWeatherSeries,
  ContinuousWeatherUnavailableError,
  getContinuousWeather,
  type WeatherProviderAttempt,
} from "../analyses/get-continuous-weather.js";
import { findParcel } from "../parcels/find-parcel.js";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import { getSoilWaterProfileForParcel } from "../soil-profiles/get-soil-profile.js";
import type { SoilProfileProvider } from "../soil-profiles/soil-profile-provider.js";
import type { WeatherConditionsProvider } from "../weather-conditions/weather-conditions-provider.js";

const HISTORICAL_SEASON_COUNT = 10;
const MAXIMUM_WEATHER_CONCURRENCY = 3;
const DAY_MILLISECONDS = 86_400_000;

export type HistoricalWaterAssessmentDependencies = {
  parcelLocator: ParcelLocator;
  soilProfileProvider: SoilProfileProvider;
  weatherPrimaryProvider: WeatherConditionsProvider;
  weatherFallbackProvider: WeatherConditionsProvider;
  weatherRecentProvider?: WeatherConditionsProvider;
  clock: () => Date;
  logger: Pick<FastifyBaseLogger, "warn">;
};

type HistoricalWeatherResult = {
  status: "complete" | "partial" | "unavailable";
  expectedDayCount: number;
  completeDayCount: number;
  precipitationAvailableDayCount: number;
  et0AvailableDayCount: number;
  missingDays: ContinuousWeatherSeries["missingDays"];
  latestContiguousCompleteDate: string | null;
  source: ContinuousWeatherSeries["source"] | null;
  attempts: WeatherProviderAttempt[];
  series: ContinuousWeatherSeries | null;
  durationMs: number;
};

function parseDate(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function expectedDayCount(startDate: string, endDate: string): number {
  return Math.round((parseDate(endDate) - parseDate(startDate)) / DAY_MILLISECONDS) + 1;
}

function scenarioDurationDays(scenario: Fao56PhenologyScenario): number {
  return (
    scenario.durations.initialDays +
    scenario.durations.developmentDays +
    scenario.durations.midSeasonDays +
    scenario.durations.lateSeasonDays
  );
}

function isActiveScenario(scenario: Fao56PhenologyScenario, analysisDate: string): boolean {
  const offset = Math.round(
    (parseDate(analysisDate) - parseDate(scenario.seasonStartDate)) / DAY_MILLISECONDS,
  );
  return offset >= 0 && offset < scenarioDurationDays(scenario);
}

function resolvePhenology(
  request: HistoricalWaterAssessmentRequest,
  cropProfileId: ReturnType<typeof findCropWaterProfileIdForArimrCrop>,
): {
  scenarios: Fao56PhenologyScenario[];
  reasonCode: string | null;
  basis: "project-standard" | "request";
  seasonStartDates: string[];
} {
  if (cropProfileId === null) {
    return {
      scenarios: [],
      reasonCode: "CROP_PROFILE_UNSUPPORTED",
      basis: request.phenology ? "request" : "project-standard",
      seasonStartDates: [],
    };
  }
  const standardSeasonStartDate = getStandardSeasonStartDate(cropProfileId, request.analysisDate);
  const basis = request.phenology ? "request" : "project-standard";
  const seasonStartDates = request.phenology
    ? request.phenology.method === "fao56-reference"
      ? [...request.phenology.seasonStartDates]
      : request.phenology.scenarios.map(({ seasonStartDate }) => seasonStartDate)
    : [standardSeasonStartDate];
  const scenarios = !request.phenology
    ? buildReferencePhenologyScenarios({
        cropProfileId,
        seasonStartDates,
        initialRootDepthMeters: 0.2,
      })
    : request.phenology.method === "fao56-reference"
      ? buildReferencePhenologyScenarios({
          cropProfileId,
          seasonStartDates: request.phenology.seasonStartDates,
          initialRootDepthMeters: request.phenology.initialRootDepthMeters,
        })
      : request.phenology.scenarios.map((scenario) => ({ ...scenario }));
  if (scenarios.length === 0) {
    return {
      scenarios: [],
      reasonCode: "PHENOLOGY_REFERENCE_UNAVAILABLE",
      basis,
      seasonStartDates,
    };
  }
  const period = resolveCropAssessmentPeriod(request.analysisDate, scenarios);
  const activeScenarios = scenarios.filter((scenario) =>
    isActiveScenario(scenario, period.evaluatedThroughDate),
  );
  return activeScenarios.length === 0
    ? {
        scenarios: [],
        reasonCode: "ANALYSIS_OUTSIDE_MODELED_SEASON",
        basis,
        seasonStartDates,
      }
    : { scenarios, reasonCode: null, basis, seasonStartDates };
}

function placeholderPlans(
  request: HistoricalWaterAssessmentRequest,
  startDates: readonly string[],
): HistoricalSeasonPlan[] {
  return Array.from({ length: HISTORICAL_SEASON_COUNT }, (_, index) => {
    const yearOffset = -(index + 1);
    const analysisDate = shiftCalendarDateByYears(request.analysisDate, yearOffset);
    const shiftedStartDates = startDates.map((date) => shiftCalendarDateByYears(date, yearOffset));
    const candidateStartDate = [...shiftedStartDates].sort()[0] ?? analysisDate;
    return {
      referenceYear: Number(analysisDate.slice(0, 4)),
      analysisDate,
      phenologyScenarios: [],
      periodStartDate: [candidateStartDate, analysisDate].sort()[0] ?? analysisDate,
      periodEndDate: analysisDate,
    };
  });
}

function parcelQuery(parcel: HistoricalWaterAssessmentRequest["parcel"]) {
  return parcel.type === "identifier"
    ? { identifier: parcel.identifier }
    : { longitude: parcel.longitude, latitude: parcel.latitude };
}

function mapSoilLayers(profile: SoilProfileResponse): Fao56SoilLayer[] {
  return profile.layers.map((layer) => ({
    topDepthMeters: layer.topDepthCm / 100,
    bottomDepthMeters: layer.bottomDepthCm / 100,
    fieldCapacity10KpaVolumetricFraction:
      layer.waterContent10KpaPercent.q50 === null ? null : layer.waterContent10KpaPercent.q50 / 100,
    fieldCapacity33KpaVolumetricFraction:
      layer.waterContent33KpaPercent.q50 === null ? null : layer.waterContent33KpaPercent.q50 / 100,
    wiltingPointVolumetricFraction:
      layer.waterContent1500KpaPercent.q50 === null
        ? null
        : layer.waterContent1500KpaPercent.q50 / 100,
  }));
}

function usableWaterLayerCount(profile: SoilProfileResponse | null): number {
  return (
    profile?.layers.filter(
      (layer) =>
        layer.waterContent10KpaPercent.q50 !== null &&
        layer.waterContent33KpaPercent.q50 !== null &&
        layer.waterContent1500KpaPercent.q50 !== null,
    ).length ?? 0
  );
}

async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  operation: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await operation(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function fetchHistoricalWeather(
  plan: HistoricalSeasonPlan,
  location: readonly [number, number],
  dependencies: HistoricalWaterAssessmentDependencies,
  signal?: AbortSignal,
): Promise<HistoricalWeatherResult> {
  const startedAt = performance.now();
  const count = expectedDayCount(plan.periodStartDate, plan.periodEndDate);
  try {
    const series = await getContinuousWeather({
      longitude: location[0],
      latitude: location[1],
      startDate: plan.periodStartDate,
      endDate: plan.periodEndDate,
      primaryProvider: dependencies.weatherPrimaryProvider,
      fallbackProvider: dependencies.weatherFallbackProvider,
      recentProvider: dependencies.weatherRecentProvider,
      signal,
    });
    return {
      status: series.status,
      expectedDayCount: series.expectedDayCount,
      completeDayCount: series.completeDayCount,
      precipitationAvailableDayCount: series.precipitationAvailableDayCount,
      et0AvailableDayCount: series.et0AvailableDayCount,
      missingDays: series.missingDays,
      latestContiguousCompleteDate: series.latestContiguousCompleteDate,
      source: series.source,
      attempts: series.attempts,
      series,
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    const attempts = error instanceof ContinuousWeatherUnavailableError ? [...error.attempts] : [];
    dependencies.logger.warn(
      {
        referenceYear: plan.referenceYear,
        provider: "weather-provider-chain",
        durationMs: Math.round(performance.now() - startedAt),
        errorCode: "HISTORICAL_WEATHER_UNAVAILABLE",
      },
      "Historical season weather could not be fetched",
    );
    return {
      status: "unavailable",
      expectedDayCount: count,
      completeDayCount: 0,
      precipitationAvailableDayCount: 0,
      et0AvailableDayCount: 0,
      missingDays: [],
      latestContiguousCompleteDate: null,
      source: null,
      attempts,
      series: null,
      durationMs: performance.now() - startedAt,
    };
  }
}

export async function createHistoricalWaterAssessment(
  request: HistoricalWaterAssessmentRequest,
  dependencies: HistoricalWaterAssessmentDependencies,
  signal?: AbortSignal,
): Promise<HistoricalWaterAssessmentResponse> {
  const totalStartedAt = performance.now();
  const today = analysisCalendarDate(dependencies.clock);
  if (request.analysisDate > today) throw new AnalysisDateInFutureError();

  const parcelStartedAt = performance.now();
  const parcel = await findParcel(parcelQuery(request.parcel), dependencies.parcelLocator, signal);
  const parcelLookupMs = performance.now() - parcelStartedAt;
  const location = findRepresentativeInteriorPoint(parcel.geometry);
  if (!location) throw new AnalysisLocationUnavailableError();

  const cropProfileId = findCropWaterProfileIdForArimrCrop(request.crop);
  const phenology = resolvePhenology(request, cropProfileId);
  const evaluation = resolveCropAssessmentPeriod(request.analysisDate, phenology.scenarios);
  const plans =
    phenology.scenarios.length > 0
      ? planAnalogousHistoricalSeasons({
          analysisDate: evaluation.evaluatedThroughDate,
          phenologyScenarios: phenology.scenarios,
          seasonCount: HISTORICAL_SEASON_COUNT,
        })
      : placeholderPlans(request, phenology.seasonStartDates);

  const soilStartedAt = performance.now();
  const soilPromise = getSoilWaterProfileForParcel(parcel, dependencies.soilProfileProvider, signal)
    .then((profile) => ({ profile, durationMs: performance.now() - soilStartedAt }))
    .catch((error: unknown) => {
      if (signal?.aborted) throw error;
      return { profile: null, durationMs: performance.now() - soilStartedAt };
    });
  const weatherAndSimulationStartedAt = performance.now();
  const weatherResultsPromise =
    phenology.scenarios.length === 0
      ? Promise.resolve(
          plans.map(
            (plan): HistoricalWeatherResult => ({
              status: "unavailable",
              expectedDayCount: expectedDayCount(plan.periodStartDate, plan.periodEndDate),
              completeDayCount: 0,
              precipitationAvailableDayCount: 0,
              et0AvailableDayCount: 0,
              missingDays: [],
              latestContiguousCompleteDate: null,
              source: null,
              attempts: [],
              series: null,
              durationMs: 0,
            }),
          ),
        )
      : mapWithConcurrency(plans, MAXIMUM_WEATHER_CONCURRENCY, (plan) =>
          fetchHistoricalWeather(plan, location, dependencies, signal),
        );
  const [soilFetch, weatherResults] = await Promise.all([soilPromise, weatherResultsPromise]);
  const soil = soilFetch.profile;
  const soilLayers = soil ? mapSoilLayers(soil) : null;

  const simulations: HistoricalSeasonSimulation[] = plans.map((plan, index) => {
    const weather = weatherResults[index];
    const reasonCodes = new Set<string>();
    if (phenology.reasonCode) reasonCodes.add(phenology.reasonCode);
    if (!soilLayers) reasonCodes.add("SOIL_PROFILE_UNAVAILABLE");
    if (plan.phenologyScenarios.length > 0) {
      if (!weather || weather.status === "unavailable") reasonCodes.add("WEATHER_UNAVAILABLE");
      else if (weather.status === "partial") reasonCodes.add("WEATHER_SERIES_INCOMPLETE");
    }

    const engineResult =
      cropProfileId && soilLayers && weather?.series && plan.phenologyScenarios.length > 0
        ? simulateFao56Season({
            cropProfileId,
            analysisDate: plan.analysisDate,
            dailyWeather: weather.series.days.map((day) => ({
              date: day.date,
              precipitationMm: day.precipitationMm,
              referenceEvapotranspirationMm: day.et0Mm,
              runoffMm: null,
              irrigationMm: null,
              capillaryRiseMm: null,
            })),
            soilLayers,
            phenologyScenarios: plan.phenologyScenarios,
            wettingTiming: request.wettingTiming ?? "unknown",
            depletionFractionMode: "adjust-for-etc",
            unknownFluxPolicy: "assume-zero-and-report",
          })
        : null;
    if (
      engineResult?.scenarios.some((scenario) =>
        scenario.issues.some(
          ({ code }) => code === "MISSING_SOIL_VALUE" || code === "ROOT_DEPTH_OUTSIDE_SOIL_PROFILE",
        ),
      )
    ) {
      reasonCodes.add("SOIL_PROFILE_INCOMPLETE");
    }
    return { plan, engineResult, incompleteReasonCodes: [...reasonCodes] };
  });

  const aggregate = aggregateHistoricalWaterAssessment(simulations);
  const waterLayerCount = usableWaterLayerCount(soil);
  const weatherAndSimulationMs = performance.now() - weatherAndSimulationStartedAt;

  return {
    status: aggregate.status,
    analysisDate: request.analysisDate,
    evaluation,
    parcel: { identifier: parcel.identifier, parcelNumber: parcel.parcelNumber },
    crop: {
      arimrId: request.crop,
      modelKind: getCropModelCapability(request.crop).kind,
      profileId: cropProfileId,
      supported: cropProfileId !== null,
      ...(cropProfileId
        ? {
            profileLabel: findCropWaterProfile(cropProfileId).label,
            profileAssumptions: getCropWaterProfileAssumptionsForArimrCrop(request.crop),
          }
        : {}),
    },
    phenology: {
      basis: phenology.basis,
      seasonStartDates: phenology.seasonStartDates,
      ...(cropProfileId === "rapeseed" && request.phenology?.method !== "explicit-scenarios"
        ? { referenceSource: RAPESEED_PHENOLOGY_REFERENCE_SOURCE }
        : {}),
    },
    referenceYears: plans.map(({ referenceYear }) => referenceYear),
    analogousSeasonRule: "same-phenology-shifted-by-whole-years",
    leapDayRule: "clamp-to-last-day-of-february",
    soil: {
      status:
        soil === null
          ? "unavailable"
          : waterLayerCount === 6
            ? "complete"
            : waterLayerCount > 0
              ? "partial"
              : "no-data",
      reusedForAllSeasons: true,
      source: soil?.provenance ?? null,
    },
    summary: {
      requiredSeasonCount: 10,
      completeSeasonCount: aggregate.completeSeasonCount,
      incompleteSeasonCount: aggregate.incompleteSeasonCount,
      seasonsWithModelledStress: aggregate.seasonsWithModelledStress,
      seasonsWithoutModelledStress: aggregate.seasonsWithoutModelledStress,
      ambiguousSeasonCount: aggregate.ambiguousSeasonCount,
      stressOccurrence: aggregate.stressOccurrence,
      noStressOccurrence: aggregate.noStressOccurrence,
      ambiguousOccurrence: aggregate.ambiguousOccurrence,
      stressDaysRange: aggregate.stressDaysRange,
      medianStressDaysRange: aggregate.medianStressDaysRange,
      longestStressEpisodeDays: aggregate.longestStressEpisodeDays,
      actualDataPeriod: aggregate.actualDataPeriod,
    },
    recurrence: {
      growthStages: aggregate.recurrence.growthStages.map((stage) => ({ ...stage })),
      mostAffectedDayPositions: aggregate.recurrence.mostAffectedDayPositions.map((position) => ({
        ...position,
      })),
    },
    seasons: aggregate.seasons.map((season, index) => {
      const weather = weatherResults[index];
      return {
        ...season,
        incompleteReasonCodes: [...season.incompleteReasonCodes],
        growthStages: season.growthStages.map((stage) => ({
          ...stage,
          stressDays: stage.stressDays ? { ...stage.stressDays } : null,
          cumulativeEvapotranspirationDeficitMm: stage.cumulativeEvapotranspirationDeficitMm
            ? { ...stage.cumulativeEvapotranspirationDeficitMm }
            : null,
        })),
        weather: {
          status: weather?.status ?? "unavailable",
          expectedDayCount:
            weather?.expectedDayCount ??
            expectedDayCount(season.periodStartDate, season.periodEndDate),
          precipitationAvailableDayCount: weather?.precipitationAvailableDayCount ?? 0,
          et0AvailableDayCount: weather?.et0AvailableDayCount ?? 0,
          completeDayCount: weather?.completeDayCount ?? 0,
          missingDays:
            weather?.missingDays.map((day) => ({ date: day.date, fields: [...day.fields] })) ?? [],
          latestContiguousCompleteDate: weather?.latestContiguousCompleteDate ?? null,
          source: weather?.source ?? null,
          attempts: weather?.attempts.map((attempt) => ({ ...attempt })) ?? [],
        },
      };
    }),
    limitations: [
      "COUNTERFACTUAL_CURRENT_CROP_PROFILE",
      "HISTORICAL_CROP_ROTATION_NOT_CONFIRMED",
      "CURRENT_PARCEL_GEOMETRY_USED_FOR_HISTORY",
      "CURRENT_SOILGRIDS_MODEL_REUSED_FOR_HISTORY",
      "HISTORICAL_IRRIGATION_RUNOFF_AND_CAPILLARY_RISE_UNKNOWN",
      "MODELLED_SUSCEPTIBILITY_NOT_CONFIRMED_HISTORICAL_LOSS",
      "WEATHER_POINT_MODEL",
      ...(weatherResults.some(({ source }) => source?.id === "open-meteo-ecmwf-ifs")
        ? ["WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS" as const]
        : []),
      "SCENARIO_RANGES_ARE_NOT_CONFIDENCE_INTERVALS",
    ],
    timing: {
      totalMs: performance.now() - totalStartedAt,
      parcelLookupMs,
      soilFetchMs: soilFetch.durationMs,
      weatherAndSimulationMs,
      maximumWeatherConcurrency: MAXIMUM_WEATHER_CONCURRENCY,
    },
  };
}
