import {
  assessSatelliteConsistency,
  buildReferencePhenologyScenarios,
  type Fao56PhenologyScenario,
  type Fao56SeasonEngineResult,
  type Fao56SoilLayer,
  findCropWaterProfile,
  findCropWaterProfileIdForArimrCrop,
  findRepresentativeInteriorPoint,
  getCropModelCapability,
  getCropWaterProfileAssumptionsForArimrCrop,
  getStandardSeasonStartDate,
  interpretSatelliteWaterSignal,
  RAPESEED_PHENOLOGY_REFERENCE_SOURCE,
  requestedDateWeatherStart,
  resolveCropAssessmentPeriod,
  simulateFao56Season,
  summarizeRequestedDateWeather,
} from "@kowr/analysis";
import type {
  SatelliteObservationSummaryResponse,
  SoilProfileResponse,
  WaterAssessmentLimitation,
  WaterAssessmentReasonCode,
  WaterAssessmentRequest,
  WaterAssessmentResponse,
} from "@kowr/contracts";
import { findParcel } from "../parcels/find-parcel.js";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import { getSatelliteObservationSummary } from "../satellite-history/get-satellite-observation-summary.js";
import type { SatelliteHistoryProvider } from "../satellite-history/satellite-history-provider.js";
import { getSoilWaterProfileForParcel } from "../soil-profiles/get-soil-profile.js";
import type { SoilProfileProvider } from "../soil-profiles/soil-profile-provider.js";
import type { WeatherConditionsProvider } from "../weather-conditions/weather-conditions-provider.js";
import { AnalysisDateInFutureError, AnalysisLocationUnavailableError } from "./analysis.errors.js";
import { analysisCalendarDate } from "./analysis-calendar.js";
import {
  type ContinuousWeatherSeries,
  ContinuousWeatherUnavailableError,
  getContinuousWeather,
} from "./get-continuous-weather.js";

const DAY_MILLISECONDS = 86_400_000;
const SATELLITE_BUDGET_MS = 8_000;

type TimedResult<T> =
  | { outcome: "fulfilled"; value: T; durationMs: number }
  | { outcome: "rejected"; error: unknown; durationMs: number };

export type WaterAssessmentDependencies = {
  parcelLocator: ParcelLocator;
  soilProfileProvider: SoilProfileProvider;
  weatherPrimaryProvider: WeatherConditionsProvider;
  weatherFallbackProvider: WeatherConditionsProvider;
  weatherRecentProvider?: WeatherConditionsProvider;
  satelliteHistoryProvider: SatelliteHistoryProvider;
  clock: () => Date;
};

function parseDate(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function differenceInDays(startDate: string, endDate: string): number {
  return Math.round((parseDate(endDate) - parseDate(startDate)) / DAY_MILLISECONDS);
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
  const offset = differenceInDays(scenario.seasonStartDate, analysisDate);
  return offset >= 0 && offset < scenarioDurationDays(scenario);
}

function resolvePhenology(
  request: WaterAssessmentRequest,
  cropProfileId: ReturnType<typeof findCropWaterProfileIdForArimrCrop>,
): {
  status: WaterAssessmentResponse["phenology"]["status"];
  scenarios: Fao56PhenologyScenario[];
  activeScenarios: Fao56PhenologyScenario[];
  basis: "project-standard" | "request" | null;
  seasonStartDates: string[];
} {
  if (cropProfileId === null) {
    return {
      status: "unsupported-crop",
      scenarios: [],
      activeScenarios: [],
      basis: null,
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
      status: "reference-unavailable",
      scenarios,
      activeScenarios: [],
      basis,
      seasonStartDates,
    };
  }

  const activeScenarios = scenarios.filter((scenario) =>
    isActiveScenario(scenario, request.analysisDate),
  );
  const status =
    activeScenarios.length === 0
      ? "outside-active-season"
      : activeScenarios.length < scenarios.length
        ? "partially-active"
        : "ready";
  return { status, scenarios, activeScenarios, basis, seasonStartDates };
}

async function settleTimed<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<TimedResult<T>> {
  const startedAt = performance.now();
  try {
    return {
      outcome: "fulfilled",
      value: await operation(),
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { outcome: "rejected", error, durationMs: performance.now() - startedAt };
  }
}

async function withinSatelliteBudget<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const operationSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(operationSignal),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("Optional satellite assessment exceeded its time budget.");
          controller.abort(error);
          reject(error);
        }, SATELLITE_BUDGET_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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
  if (!profile) return 0;
  return profile.layers.filter(
    (layer) =>
      layer.waterContent10KpaPercent.q50 !== null &&
      layer.waterContent33KpaPercent.q50 !== null &&
      layer.waterContent1500KpaPercent.q50 !== null,
  ).length;
}

function reasonForBalance(
  engineResult: Fao56SeasonEngineResult | null,
): WaterAssessmentReasonCode | null {
  switch (engineResult?.balanceAssessment.balanceReason) {
    case "core-scenarios-show-no-stress":
      return "NO_MODELLED_STRESS_IN_ALL_SCENARIOS";
    case "core-scenarios-show-stress":
      return "MODELLED_STRESS_IN_ALL_SCENARIOS";
    case "core-scenarios-disagree":
      return "SCENARIO_CONCLUSIONS_DISAGREE";
    case "required-core-scenario-missing":
    case "core-scenarios-reach-complete-depletion":
      return "REQUIRED_SCENARIO_INCOMPLETE";
    default:
      return null;
  }
}

function emptyScenarioSummary(): WaterAssessmentResponse["scenarios"] {
  return {
    totalCount: 0,
    completeCount: 0,
    finalWaterStressCoefficient: null,
    finalRootZoneDepletionMm: null,
    stressDays: null,
    cumulativeEvapotranspirationDeficitMm: null,
    initialConditionConvergence: {
      evaluatedPairs: 0,
      pairsWithSameStressConclusion: 0,
      pairsWithNumericallyConvergedState: 0,
      maximumFinalDepletionDifferenceMm: null,
      maximumFinalWaterStressCoefficientDifference: null,
    },
    families: [],
    results: [],
  };
}

function mapScenarioFamilies(
  engineResult: Fao56SeasonEngineResult,
): WaterAssessmentResponse["scenarios"]["families"] {
  const families = new Map<
    string,
    {
      phenologyScenarioId: string;
      fieldCapacity: "10-kpa" | "33-kpa";
      completeCount: number;
      totalCount: number;
    }
  >();

  for (const scenario of engineResult.scenarios) {
    const { fieldCapacity, phenologyScenarioId } = scenario.configuration;
    const key = `${phenologyScenarioId}:${fieldCapacity}`;
    const family = families.get(key) ?? {
      phenologyScenarioId,
      fieldCapacity,
      completeCount: 0,
      totalCount: 0,
    };
    family.totalCount += 1;
    if (scenario.status === "complete") family.completeCount += 1;
    families.set(key, family);
  }

  return [...families.values()].map((family) => ({
    ...family,
    status:
      family.completeCount === family.totalCount
        ? ("complete" as const)
        : family.completeCount === 0
          ? ("unavailable" as const)
          : ("partial" as const),
    canChangeConclusion: family.completeCount < family.totalCount,
  }));
}

function mapScenarioSummary(
  engineResult: Fao56SeasonEngineResult | null,
): WaterAssessmentResponse["scenarios"] {
  if (!engineResult) return emptyScenarioSummary();
  return {
    totalCount: engineResult.scenarios.length,
    completeCount: engineResult.spread.completeScenarioCount,
    finalWaterStressCoefficient: engineResult.spread.finalWaterStressCoefficient,
    finalRootZoneDepletionMm: engineResult.spread.finalRootZoneDepletionMm,
    stressDays: engineResult.spread.stressDays,
    cumulativeEvapotranspirationDeficitMm:
      engineResult.spread.cumulativeEvapotranspirationDeficitMm,
    initialConditionConvergence: engineResult.initialConditionConvergence,
    families: mapScenarioFamilies(engineResult),
    results: engineResult.scenarios.map((scenario) => ({
      id: scenario.configuration.id,
      status: scenario.status,
      configuration: {
        phenologyScenarioId: scenario.configuration.phenologyScenarioId,
        phenologyDescription: scenario.configuration.phenologyDescription,
        seasonStartDate: scenario.configuration.seasonStartDate,
        phenologySource: scenario.configuration.phenologySource,
        stageDurations: scenario.configuration.stageDurations,
        fieldCapacity: scenario.configuration.fieldCapacity,
        initialCondition: scenario.configuration.initialCondition,
        wettingTiming: scenario.configuration.wettingTiming,
        cropCoefficientInitial: scenario.configuration.cropCoefficientInitial,
        cropCoefficientMidSeason: scenario.configuration.cropCoefficientMidSeason,
        cropCoefficientLateSeason: scenario.configuration.cropCoefficientLateSeason,
        initialRootDepthMeters: scenario.configuration.initialRootDepthMeters,
        maximumRootDepthMeters: scenario.configuration.maximumRootDepthMeters,
      },
      issues: scenario.issues.map((issue) => ({ ...issue })),
      summary: scenario.summary,
      stressEpisodes: scenario.stressEpisodes.map((episode) => ({ ...episode })),
    })),
  };
}

function availableScenarioConclusion(
  engineResult: Fao56SeasonEngineResult | null,
): WaterAssessmentResponse["availableScenarioConclusion"] {
  const stressStates =
    engineResult?.scenarios.flatMap((scenario) => {
      const coefficient = scenario.summary.finalWaterStressCoefficient;
      return scenario.status === "complete" && coefficient !== null ? [coefficient < 1 - 1e-9] : [];
    }) ?? [];
  if (stressStates.length === 0) return null;
  if (stressStates.every(Boolean)) return "consistent-stress";
  if (stressStates.every((state) => !state)) return "consistent-no-stress";
  return "scenario-disagreement";
}

function assessmentLevel(
  engineResult: Fao56SeasonEngineResult | null,
  hasWeatherContext: boolean,
): WaterAssessmentResponse["assessmentLevel"] {
  if (engineResult) {
    const completeCount = engineResult.spread.completeScenarioCount;
    const totalCount = engineResult.scenarios.length;
    if (totalCount > 0 && completeCount === totalCount) {
      return engineResult.balanceAssessment.balanceClassification === "indeterminate"
        ? "assumption-dependent"
        : "full-fao56";
    }
    if (completeCount > 0) return "limited-fao56";
  }
  return hasWeatherContext ? "weather-context-only" : "unavailable";
}

function satelliteAvailability(
  requested: boolean,
  result: TimedResult<SatelliteObservationSummaryResponse> | null,
): Pick<WaterAssessmentResponse["satellite"], "status" | "observationDate" | "reason"> {
  if (!requested) {
    return {
      status: "not-requested",
      observationDate: null,
      reason: "not-requested",
    };
  }
  if (!result || result.outcome === "rejected") {
    return {
      status: "unavailable",
      observationDate: null,
      reason: "provider-unavailable",
    };
  }
  return {
    status: result.value.status,
    observationDate: result.value.selectedObservation?.date ?? null,
    reason: result.value.reason,
  };
}

function parcelQuery(parcel: WaterAssessmentRequest["parcel"]) {
  return parcel.type === "identifier"
    ? { identifier: parcel.identifier }
    : { longitude: parcel.longitude, latitude: parcel.latitude };
}

export async function createWaterAssessment(
  request: WaterAssessmentRequest,
  dependencies: WaterAssessmentDependencies,
  signal?: AbortSignal,
): Promise<WaterAssessmentResponse> {
  const totalStartedAt = performance.now();
  const today = analysisCalendarDate(dependencies.clock);
  if (request.analysisDate > today) throw new AnalysisDateInFutureError();

  const parcelStartedAt = performance.now();
  const parcel = await findParcel(parcelQuery(request.parcel), dependencies.parcelLocator, signal);
  const parcelLookupMs = performance.now() - parcelStartedAt;
  const location = findRepresentativeInteriorPoint(parcel.geometry);
  if (!location) throw new AnalysisLocationUnavailableError();

  const cropProfileId = findCropWaterProfileIdForArimrCrop(request.crop);
  const requestedPhenology = resolvePhenology(request, cropProfileId);
  const evaluation = resolveCropAssessmentPeriod(
    request.analysisDate,
    requestedPhenology.scenarios,
  );
  const evaluationDate = evaluation.evaluatedThroughDate;
  const phenology =
    evaluation.scope === "completed-season"
      ? resolvePhenology({ ...request, analysisDate: evaluationDate }, cropProfileId)
      : requestedPhenology;
  const weatherPurpose =
    phenology.activeScenarios.length > 0 ? "fao56-season" : "analysis-day-context";
  const dateContextStart = requestedDateWeatherStart(request.analysisDate);
  const weatherStartDate =
    weatherPurpose === "fao56-season"
      ? (phenology.scenarios
          .map(({ seasonStartDate }) => seasonStartDate)
          .sort((left, right) => left.localeCompare(right))[0] ?? request.analysisDate)
      : dateContextStart;

  const weatherPromise = settleTimed(
    () =>
      getContinuousWeather({
        longitude: location[0],
        latitude: location[1],
        startDate: weatherStartDate,
        endDate: evaluationDate,
        primaryProvider: dependencies.weatherPrimaryProvider,
        fallbackProvider: dependencies.weatherFallbackProvider,
        recentProvider: dependencies.weatherRecentProvider,
        ongoingDate: today,
        signal,
      }),
    signal,
  );
  const soilPromise = settleTimed(
    () => getSoilWaterProfileForParcel(parcel, dependencies.soilProfileProvider, signal),
    signal,
  );
  const dateContextPromise =
    evaluationDate === request.analysisDate && weatherStartDate <= dateContextStart
      ? weatherPromise
      : settleTimed(
          () =>
            getContinuousWeather({
              longitude: location[0],
              latitude: location[1],
              startDate: dateContextStart,
              endDate: request.analysisDate,
              primaryProvider: dependencies.weatherPrimaryProvider,
              fallbackProvider: dependencies.weatherFallbackProvider,
              recentProvider: dependencies.weatherRecentProvider,
              ongoingDate: today,
              signal,
            }),
          signal,
        );
  const includeSatellite =
    (request.includeSatellite ?? false) && evaluation.scope === "analysis-day";
  const satellitePromise = includeSatellite
    ? settleTimed(
        () =>
          withinSatelliteBudget(
            (satelliteSignal) =>
              getSatelliteObservationSummary(
                parcel.geometry,
                request.analysisDate,
                dependencies.satelliteHistoryProvider,
                satelliteSignal,
              ),
            signal,
          ),
        signal,
      )
    : Promise.resolve(null);
  const [weatherFetch, soilFetch, satelliteFetch, dateContextFetch] = await Promise.all([
    weatherPromise,
    soilPromise,
    satellitePromise,
    dateContextPromise,
  ]);

  const weather: ContinuousWeatherSeries | null =
    weatherFetch.outcome === "fulfilled" ? weatherFetch.value : null;
  const soil: SoilProfileResponse | null =
    soilFetch.outcome === "fulfilled" ? soilFetch.value : null;
  const dateWeather = dateContextFetch.outcome === "fulfilled" ? dateContextFetch.value : null;
  const dateContext = summarizeRequestedDateWeather(request.analysisDate, dateWeather?.days ?? []);
  const simulationStartedAt = performance.now();
  const engineResult =
    cropProfileId && soil && phenology.activeScenarios.length > 0
      ? simulateFao56Season({
          cropProfileId,
          analysisDate: evaluationDate,
          dailyWeather: (weather?.days ?? []).map((day) => ({
            date: day.date,
            precipitationMm: day.precipitationMm,
            referenceEvapotranspirationMm: day.et0Mm,
            runoffMm: null,
            irrigationMm: null,
            capillaryRiseMm: null,
          })),
          soilLayers: mapSoilLayers(soil),
          phenologyScenarios: phenology.scenarios,
          wettingTiming: request.wettingTiming ?? "unknown",
          depletionFractionMode: "adjust-for-etc",
          unknownFluxPolicy: "assume-zero-and-report",
        })
      : null;
  const candidateDate = weather?.latestContiguousCompleteDate ?? null;
  const candidatePhenology = candidateDate
    ? resolvePhenology({ ...request, analysisDate: candidateDate }, cropProfileId)
    : null;
  const candidateResult =
    candidateDate &&
    candidateDate < evaluationDate &&
    cropProfileId &&
    soil &&
    weather &&
    candidatePhenology?.status === "ready" &&
    candidatePhenology.activeScenarios.every(
      ({ seasonStartDate }) => seasonStartDate >= weatherStartDate,
    )
      ? simulateFao56Season({
          cropProfileId,
          analysisDate: candidateDate,
          dailyWeather: weather.days.map((day) => ({
            date: day.date,
            precipitationMm: day.precipitationMm,
            referenceEvapotranspirationMm: day.et0Mm,
            runoffMm: null,
            irrigationMm: null,
            capillaryRiseMm: null,
          })),
          soilLayers: mapSoilLayers(soil),
          phenologyScenarios: candidatePhenology.scenarios,
          wettingTiming: request.wettingTiming ?? "unknown",
          depletionFractionMode: "adjust-for-etc",
          unknownFluxPolicy: "assume-zero-and-report",
        })
      : null;
  const latestCompleteAssessmentDate =
    candidateResult &&
    candidateResult.scenarios.length > 0 &&
    candidateResult.scenarios.every((scenario) => scenario.status === "complete")
      ? candidateDate
      : null;
  const simulationMs = performance.now() - simulationStartedAt;

  const reasons = new Set<WaterAssessmentReasonCode>();
  if (!cropProfileId) reasons.add("CROP_PROFILE_UNSUPPORTED");
  if (phenology.status === "reference-unavailable") {
    reasons.add("PHENOLOGY_REFERENCE_UNAVAILABLE");
  }
  if (phenology.status === "outside-active-season" || phenology.status === "partially-active") {
    reasons.add("ANALYSIS_OUTSIDE_MODELED_SEASON");
  }
  if (!weather) reasons.add("WEATHER_UNAVAILABLE");
  else if (weather.status === "partial") reasons.add("WEATHER_SERIES_INCOMPLETE");
  const waterLayerCount = usableWaterLayerCount(soil);
  if (!soil) reasons.add("SOIL_PROFILE_UNAVAILABLE");
  else if (
    phenology.activeScenarios.length > 0 &&
    engineResult?.scenarios.some((scenario) =>
      scenario.issues.some(
        ({ code }) => code === "MISSING_SOIL_VALUE" || code === "ROOT_DEPTH_OUTSIDE_SOIL_PROFILE",
      ),
    )
  ) {
    reasons.add("SOIL_PROFILE_INCOMPLETE");
  }
  const balanceReason = reasonForBalance(engineResult);
  if (balanceReason) reasons.add(balanceReason);
  const satelliteBase = satelliteAvailability(includeSatellite, satelliteFetch);
  const satellite = (() => {
    if (!includeSatellite) {
      return {
        ...satelliteBase,
        signal: "not-qualified" as const,
        consistency: "not-qualified" as const,
        limitsInterpretation: true,
        interpretationReason: "not-requested" as const,
      };
    }
    const interpretation = interpretSatelliteWaterSignal({
      analysisDate: evaluationDate,
      historyDates:
        satelliteFetch?.outcome === "fulfilled"
          ? satelliteFetch.value.history.map(({ date }) => date)
          : [],
      observationDate: satelliteBase.observationDate,
      phenologyScenarios: phenology.activeScenarios,
      status: satelliteBase.status === "not-requested" ? "unavailable" : satelliteBase.status,
      trend:
        satelliteFetch?.outcome === "fulfilled"
          ? satelliteFetch.value.trend
          : {
              direction: "insufficient" as const,
              observationCount: 0,
              pValue: null,
              slopePerDay: null,
              method: "mann-kendall-theil-sen" as const,
            },
    });
    const comparison = assessSatelliteConsistency(
      interpretation.signal,
      engineResult?.balanceAssessment.balanceClassification ?? "insufficient-data",
    );
    return {
      ...satelliteBase,
      ...comparison,
      interpretationReason: interpretation.reason,
    };
  })();
  if (includeSatellite && satellite.status === "unavailable") reasons.add("SATELLITE_UNAVAILABLE");

  const limitations = new Set<WaterAssessmentLimitation>([
    "RAINFED_FULL_INFILTRATION_ASSUMPTION",
    "WEATHER_POINT_MODEL",
  ]);
  for (const limitation of engineResult?.limitations ?? []) limitations.add(limitation);
  if (weather?.status === "partial") limitations.add("WEATHER_SERIES_INCOMPLETE");
  if (weather?.source.id === "open-meteo-ecmwf-ifs") {
    limitations.add("WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS");
  }
  if (weather?.source.provider === "NASA POWER") {
    limitations.add("WEATHER_FALLBACK_TIME_STANDARD_DIFFERS");
  }
  if (soil) {
    limitations.add("SOIL_SINGLE_MODEL_CELL");
    limitations.add("SOIL_NOT_CURRENT_MOISTURE");
    limitations.add("SOIL_NOT_DATE_SPECIFIC");
  }
  if (weatherPurpose === "analysis-day-context") limitations.add("ANALYSIS_DAY_WEATHER_ONLY");
  if (request.analysisDate.slice(0, 4) !== today.slice(0, 4)) {
    limitations.add("HISTORICAL_CROP_NOT_CONFIRMED");
  }
  if (includeSatellite) limitations.add("SATELLITE_NOT_USED_IN_BALANCE");

  const sources: WaterAssessmentResponse["sources"] = [
    {
      kind: "parcel",
      provider: parcel.provenance.provider,
      dataset: parcel.provenance.datasource,
      sourceUrl: null,
      retrievedAt: parcel.provenance.retrievedAt,
      dataFrom: null,
      dataTo: null,
      timeStandard: null,
    },
  ];
  if (weather) {
    sources.push({
      kind: "weather",
      provider: weather.source.provider,
      dataset: weather.source.dataset,
      sourceUrl: weather.source.sourceUrl,
      retrievedAt: weather.source.retrievedAt,
      dataFrom: weatherStartDate,
      dataTo: evaluationDate,
      timeStandard: weather.source.timeStandard,
    });
  }
  if (soil) {
    sources.push({
      kind: "soil",
      provider: soil.provenance.provider,
      dataset: soil.provenance.dataset,
      sourceUrl: soil.provenance.sourceUrl,
      retrievedAt: soil.provenance.retrievedAt,
      dataFrom: null,
      dataTo: null,
      timeStandard: null,
    });
  }
  if (satelliteFetch?.outcome === "fulfilled") {
    sources.push({
      kind: "satellite",
      provider: satelliteFetch.value.provenance.provider,
      dataset: satelliteFetch.value.provenance.collection,
      sourceUrl: satelliteFetch.value.provenance.sourceUrl,
      retrievedAt: satelliteFetch.value.provenance.retrievedAt,
      dataFrom: satelliteFetch.value.searchPeriod.from,
      dataTo: satelliteFetch.value.searchPeriod.to,
      timeStandard: "UTC acquisition timestamps",
    });
  }

  const weatherExpectedDays = differenceInDays(weatherStartDate, evaluationDate) + 1;
  const hasWeatherContext =
    weather?.days.some((day) =>
      [
        day.precipitationMm,
        day.et0Mm,
        day.temperatureMeanCelsius,
        day.temperatureMinCelsius,
        day.temperatureMaxCelsius,
      ].some((value) => value !== null),
    ) ?? false;
  const level = assessmentLevel(engineResult, hasWeatherContext);
  const result: WaterAssessmentResponse = {
    requestedDateConditions: {
      ...dateContext,
      date: request.analysisDate,
      ongoingDay: request.analysisDate === today,
      cropAssessment:
        evaluation.scope === "completed-season" ||
        requestedPhenology.status === "outside-active-season"
          ? "outside-modelled-season"
          : engineResult
            ? "fao56"
            : "unavailable",
      status:
        dateContext.precipitationDayCount === 30 && dateContext.et0DayCount === 30
          ? "complete"
          : dateContext.precipitationDayCount + dateContext.et0DayCount > 0
            ? "partial"
            : "unavailable",
      source: dateWeather?.source ?? null,
    },
    status: engineResult?.status ?? "insufficient-data",
    assessmentLevel: level,
    dataAvailability:
      level === "unavailable"
        ? "unavailable"
        : level === "full-fao56" || level === "assumption-dependent"
          ? "complete"
          : "partial",
    availableScenarioConclusion: availableScenarioConclusion(engineResult),
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
      status: phenology.status,
      scenarioCount: phenology.scenarios.length,
      activeScenarioCount: phenology.activeScenarios.length,
      basis: phenology.basis,
      seasonStartDates: phenology.seasonStartDates,
      ...(cropProfileId === "rapeseed" && request.phenology?.method !== "explicit-scenarios"
        ? { referenceSource: RAPESEED_PHENOLOGY_REFERENCE_SOURCE }
        : {}),
    },
    balance: {
      classification: engineResult?.balanceAssessment.balanceClassification ?? "insufficient-data",
      scenarioConsensus: engineResult?.balanceAssessment.scenarioConsensus ?? "insufficient-data",
      reason: engineResult?.balanceAssessment.balanceReason ?? null,
    },
    reasonCodes: [...reasons],
    weather: {
      status: weather?.status ?? "unavailable",
      purpose: weatherPurpose,
      period: {
        startDate: weatherStartDate,
        endDate: evaluationDate,
        expectedDayCount: weather?.expectedDayCount ?? weatherExpectedDays,
      },
      precipitationAvailableDayCount: weather?.precipitationAvailableDayCount ?? 0,
      et0AvailableDayCount: weather?.et0AvailableDayCount ?? 0,
      completeDayCount: weather?.completeDayCount ?? 0,
      missingDays:
        weather?.missingDays.map((day) => ({
          date: day.date,
          fields: [...day.fields],
          cause: day.cause,
        })) ?? [],
      latestContiguousCompleteDate: weather?.latestContiguousCompleteDate ?? null,
      latestCompleteAssessmentDate,
      source: weather?.source ?? null,
      attempts:
        weather?.attempts.map((attempt) => ({ ...attempt })) ??
        (weatherFetch.outcome === "rejected" &&
        weatherFetch.error instanceof ContinuousWeatherUnavailableError
          ? weatherFetch.error.attempts.map((attempt) => ({ ...attempt }))
          : weatherFetch.outcome === "rejected"
            ? [
                {
                  providerRole: "primary",
                  providerId: dependencies.weatherPrimaryProvider.id,
                  outcome: "failed",
                  errorCode: "UNKNOWN",
                },
                {
                  providerRole: "fallback",
                  providerId: dependencies.weatherFallbackProvider.id,
                  outcome: "failed",
                  errorCode: "UNKNOWN",
                },
              ]
            : []),
    },
    soil: {
      status:
        soil === null
          ? "unavailable"
          : waterLayerCount === 6
            ? "complete"
            : waterLayerCount > 0
              ? "partial"
              : "no-data",
      usableWaterLayerCount: waterLayerCount,
      source: soil?.provenance ?? null,
    },
    scenarios: mapScenarioSummary(engineResult),
    satellite,
    assumptions: {
      depletionFractionMode: "adjust-for-etc",
      unknownFluxPolicy: "assume-zero-and-report",
      wettingTiming: request.wettingTiming ?? "unknown",
    },
    limitations: [...limitations],
    sources,
    timing: {
      totalMs: performance.now() - totalStartedAt,
      parcelLookupMs,
      weatherFetchMs: weatherFetch.durationMs,
      soilFetchMs: soilFetch.durationMs,
      satelliteFetchMs: satelliteFetch?.durationMs ?? null,
      simulationMs,
    },
  };

  if (evaluation.scope !== "completed-season") return result;
  const hasDateWeather = dateContext.precipitationDayCount + dateContext.et0DayCount > 0;
  const dateLimitations = new Set<WaterAssessmentLimitation>([
    "WEATHER_POINT_MODEL",
    "ANALYSIS_DAY_WEATHER_ONLY",
  ]);
  if (dateWeather?.status === "partial") dateLimitations.add("WEATHER_SERIES_INCOMPLETE");
  if (dateWeather?.source.id === "open-meteo-ecmwf-ifs")
    dateLimitations.add("WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS");
  if (dateWeather?.source.provider === "NASA POWER")
    dateLimitations.add("WEATHER_FALLBACK_TIME_STANDARD_DIFFERS");
  if (soil) {
    dateLimitations.add("SOIL_SINGLE_MODEL_CELL");
    dateLimitations.add("SOIL_NOT_CURRENT_MOISTURE");
    dateLimitations.add("SOIL_NOT_DATE_SPECIFIC");
  }

  // The primary response always evaluates the requested date. A past crop balance is context.
  return {
    ...result,
    completedSeason: { ...result, requestedDateConditions: undefined },
    status: "insufficient-data",
    assessmentLevel: hasDateWeather ? "weather-context-only" : "unavailable",
    dataAvailability: hasDateWeather ? "partial" : "unavailable",
    availableScenarioConclusion: null,
    evaluation: { scope: "analysis-day", evaluatedThroughDate: request.analysisDate },
    phenology: { ...result.phenology, status: "outside-active-season", activeScenarioCount: 0 },
    balance: { classification: "insufficient-data", scenarioConsensus: null, reason: null },
    scenarios: emptyScenarioSummary(),
    reasonCodes: [
      "ANALYSIS_OUTSIDE_MODELED_SEASON",
      ...(!dateWeather
        ? ["WEATHER_UNAVAILABLE" as const]
        : dateWeather.status === "partial"
          ? ["WEATHER_SERIES_INCOMPLETE" as const]
          : []),
    ],
    weather: {
      status: dateWeather?.status ?? "unavailable",
      purpose: "analysis-day-context",
      period: dateContext.period,
      precipitationAvailableDayCount: dateContext.precipitationDayCount,
      et0AvailableDayCount: dateContext.et0DayCount,
      completeDayCount: dateWeather?.completeDayCount ?? 0,
      missingDays: dateWeather?.missingDays ?? [],
      latestContiguousCompleteDate: dateWeather?.latestContiguousCompleteDate ?? null,
      latestCompleteAssessmentDate: null,
      source: dateWeather?.source ?? null,
      attempts:
        dateWeather?.attempts ??
        (dateContextFetch.outcome === "rejected" &&
        dateContextFetch.error instanceof ContinuousWeatherUnavailableError
          ? [...dateContextFetch.error.attempts]
          : []),
    },
    limitations: [...dateLimitations],
    timing: { ...result.timing, weatherFetchMs: dateContextFetch.durationMs },
    sources: [
      ...result.sources.filter((source) => source.kind !== "weather"),
      ...(dateWeather
        ? [
            {
              kind: "weather" as const,
              provider: dateWeather.source.provider,
              dataset: dateWeather.source.dataset,
              sourceUrl: dateWeather.source.sourceUrl,
              retrievedAt: dateWeather.source.retrievedAt,
              dataFrom: dateContext.period.startDate,
              dataTo: request.analysisDate,
              timeStandard: dateWeather.source.timeStandard,
            },
          ]
        : []),
    ],
  };
}
