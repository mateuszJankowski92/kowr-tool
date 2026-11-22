import {
  type CropWaterProfileId,
  type Fao56GrowthStageDurations,
  findCropWaterProfile,
  type NumericRange,
} from "./crop-water-profiles.js";
import {
  calculateFao56DailyStep,
  FAO56_NUMERIC_TOLERANCE,
  type Fao56WettingTiming,
} from "./fao56-water-stress.js";
import { assessFao56Balance, type Fao56BalanceAssessment } from "./water-situation-assessment.js";

const DAY_MILLISECONDS = 86_400_000;
const MASS_BALANCE_TOLERANCE_MM = 1e-8;

export type Fao56DailyWeather = {
  date: string;
  precipitationMm: number | null;
  referenceEvapotranspirationMm: number | null;
  runoffMm: number | null;
  irrigationMm: number | null;
  capillaryRiseMm: number | null;
};

export type Fao56SoilLayer = {
  topDepthMeters: number;
  bottomDepthMeters: number;
  fieldCapacity10KpaVolumetricFraction: number | null;
  fieldCapacity33KpaVolumetricFraction: number | null;
  wiltingPointVolumetricFraction: number | null;
};

export type Fao56PhenologyScenario = {
  id: string;
  seasonStartDate: string;
  durations: Fao56GrowthStageDurations;
  initialRootDepthMeters: number;
  source: "fao56-reference" | "project-adapted-reference" | "local-observation" | "user-supplied";
  description: string;
};

export type Fao56GrowthStage = "initial" | "development" | "mid-season" | "late-season";
export type Fao56InitialCondition = "field-capacity" | "wilting-point";
export type Fao56FieldCapacityScenario = "10-kpa" | "33-kpa";

export type Fao56ScenarioConfiguration = {
  id: string;
  phenologyScenarioId: string;
  phenologyDescription: string;
  seasonStartDate: string;
  phenologySource: Fao56PhenologyScenario["source"];
  stageDurations: Fao56GrowthStageDurations;
  fieldCapacity: Fao56FieldCapacityScenario;
  initialCondition: Fao56InitialCondition;
  wettingTiming: Fao56WettingTiming;
  cropCoefficientInitial: number;
  cropCoefficientMidSeason: number;
  cropCoefficientLateSeason: number;
  initialRootDepthMeters: number;
  maximumRootDepthMeters: number;
};

export type Fao56DailyResult = {
  date: string;
  dayOfSeason: number;
  growthStage: Fao56GrowthStage;
  cropCoefficient: number;
  rootDepthMeters: number;
  totalAvailableWaterMm: number;
  readilyAvailableWaterMm: number;
  depletionFraction: number;
  rootGrowthDepletionAdjustmentMm: number;
  rootZoneDepletionAtStartMm: number;
  rootZoneDepletionAtEndMm: number;
  waterStressCoefficient: number;
  referenceEvapotranspirationMm: number;
  potentialCropEvapotranspirationMm: number;
  adjustedCropEvapotranspirationMm: number;
  actualCropEvapotranspirationMm: number;
  precipitationMm: number;
  runoffMm: number;
  irrigationMm: number;
  capillaryRiseMm: number;
  deepPercolationMm: number;
  unmetCropEvapotranspirationMm: number;
  massBalanceResidualMm: number;
};

export type Fao56StressEpisode = {
  startDate: string;
  endDate: string;
  durationDays: number;
  minimumWaterStressCoefficient: number;
  potentialCropEvapotranspirationMm: number;
  adjustedCropEvapotranspirationMm: number;
  evapotranspirationDeficitMm: number;
};

export type Fao56ScenarioIssueCode =
  | "ANALYSIS_BEFORE_SEASON"
  | "ANALYSIS_AFTER_MODELED_SEASON"
  | "INVALID_ROOT_DEPTH_RANGE"
  | "MISSING_WEATHER_DAY"
  | "MISSING_WEATHER_VALUE"
  | "MISSING_SOIL_VALUE"
  | "ROOT_DEPTH_OUTSIDE_SOIL_PROFILE";

export type Fao56ScenarioIssue = {
  code: Fao56ScenarioIssueCode;
  date?: string;
  field?: string;
};

export type Fao56ScenarioResult = {
  configuration: Fao56ScenarioConfiguration;
  status: "complete" | "incomplete";
  days: readonly Fao56DailyResult[];
  stressEpisodes: readonly Fao56StressEpisode[];
  summary: {
    simulatedDays: number;
    stressDays: number;
    longestStressEpisodeDays: number;
    minimumWaterStressCoefficient: number | null;
    finalWaterStressCoefficient: number | null;
    finalRootZoneDepletionMm: number | null;
    cumulativePotentialCropEvapotranspirationMm: number;
    cumulativeAdjustedCropEvapotranspirationMm: number;
    cumulativeEvapotranspirationDeficitMm: number;
    totalDeepPercolationMm: number;
    maximumAbsoluteMassBalanceResidualMm: number;
  };
  issues: readonly Fao56ScenarioIssue[];
};

export type Fao56SeasonEngineResult = {
  status: "complete" | "indeterminate" | "insufficient-data";
  cropProfileId: CropWaterProfileId;
  analysisDate: string;
  assumptions: {
    depletionFractionMode: Fao56SeasonEngineInput["depletionFractionMode"];
    unknownFluxPolicy: Fao56SeasonEngineInput["unknownFluxPolicy"];
    requestedWettingTiming: Fao56SeasonEngineInput["wettingTiming"];
  };
  balanceAssessment: Fao56BalanceAssessment;
  scenarios: readonly Fao56ScenarioResult[];
  spread: {
    completeScenarioCount: number;
    incompleteScenarioCount: number;
    finalWaterStressCoefficient: { minimum: number; maximum: number } | null;
    finalRootZoneDepletionMm: { minimum: number; maximum: number } | null;
    stressDays: { minimum: number; maximum: number } | null;
    cumulativeEvapotranspirationDeficitMm: { minimum: number; maximum: number } | null;
  };
  initialConditionConvergence: {
    evaluatedPairs: number;
    pairsWithSameStressConclusion: number;
    pairsWithNumericallyConvergedState: number;
    maximumFinalDepletionDifferenceMm: number | null;
    maximumFinalWaterStressCoefficientDifference: number | null;
  };
  limitations: readonly (
    | "SINGLE_CROP_COEFFICIENT_APPROXIMATION"
    | "MODELLED_SOIL_PROPERTIES"
    | "PHENOLOGY_NOT_POLAND_CALIBRATED"
    | "INITIAL_SUBSOIL_WATER_BRACKETED_BY_EXTREMES"
    | "UNKNOWN_WETTING_TIME_BRACKETED"
    | "UNKNOWN_FLUXES_ASSUMED_ZERO"
    | "STRONG_CLASSIFICATION_DISABLED"
  )[];
};

export type Fao56SeasonEngineInput = {
  cropProfileId: CropWaterProfileId;
  analysisDate: string;
  dailyWeather: readonly Fao56DailyWeather[];
  soilLayers: readonly Fao56SoilLayer[];
  phenologyScenarios: readonly Fao56PhenologyScenario[];
  wettingTiming: Fao56WettingTiming | "unknown";
  depletionFractionMode: "table-value" | "adjust-for-etc";
  unknownFluxPolicy: "require-values" | "assume-zero-and-report";
};

type ParameterScenario = {
  id: string;
  cropCoefficientInitial: number;
  cropCoefficientMidSeason: number;
  cropCoefficientLateSeason: number;
  maximumRootDepthMeters: number;
};

function parseCalendarDate(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return timestamp;
}

function formatCalendarDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayDifference(startDate: string, endDate: string): number {
  return (parseCalendarDate(endDate) - parseCalendarDate(startDate)) / DAY_MILLISECONDS;
}

function dateRange(startDate: string, endDate: string): string[] {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  const dates: string[] = [];
  for (let timestamp = start; timestamp <= end; timestamp += DAY_MILLISECONDS) {
    dates.push(formatCalendarDate(timestamp));
  }
  return dates;
}

function requireFiniteNonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

function requireFractionOrNull(value: number | null, name: string): void {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError(`${name} must be null or between 0 and 1.`);
  }
}

function validateDurations(durations: Fao56GrowthStageDurations): void {
  for (const [name, value] of Object.entries(durations)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer.`);
    }
  }
}

function totalSeasonDays(durations: Fao56GrowthStageDurations): number {
  return (
    durations.initialDays +
    durations.developmentDays +
    durations.midSeasonDays +
    durations.lateSeasonDays
  );
}

function rangeEndpoints(range: NumericRange): number[] {
  return range.minimum === range.maximum ? [range.minimum] : [range.minimum, range.maximum];
}

function buildParameterScenarios(cropProfileId: CropWaterProfileId): ParameterScenario[] {
  const profile = findCropWaterProfile(cropProfileId);
  const scenarios: ParameterScenario[] = [];
  for (const initial of rangeEndpoints(profile.cropCoefficients.initial)) {
    for (const midSeason of rangeEndpoints(profile.cropCoefficients.midSeason)) {
      for (const lateSeason of rangeEndpoints(profile.cropCoefficients.lateSeason)) {
        for (const maximumRootDepthMeters of rangeEndpoints(profile.maximumRootDepthMeters)) {
          scenarios.push({
            id: `kc-${initial}-${midSeason}-${lateSeason}_root-${maximumRootDepthMeters}`,
            cropCoefficientInitial: initial,
            cropCoefficientMidSeason: midSeason,
            cropCoefficientLateSeason: lateSeason,
            maximumRootDepthMeters,
          });
        }
      }
    }
  }
  return scenarios;
}

export function buildReferencePhenologyScenarios(input: {
  cropProfileId: CropWaterProfileId;
  seasonStartDates: readonly string[];
  initialRootDepthMeters: number;
}): Fao56PhenologyScenario[] {
  const profile = findCropWaterProfile(input.cropProfileId);
  requireFiniteNonnegative(input.initialRootDepthMeters, "initialRootDepthMeters");
  return input.seasonStartDates.flatMap((seasonStartDate, startIndex) => {
    parseCalendarDate(seasonStartDate);
    return profile.stageDurationReferences.map((reference, referenceIndex) => ({
      id: `start-${startIndex + 1}_reference-${referenceIndex + 1}`,
      seasonStartDate,
      durations: reference.durations,
      initialRootDepthMeters: input.initialRootDepthMeters,
      source: reference.source ?? "fao56-reference",
      description: reference.context,
    }));
  });
}

function validateSoilLayers(layers: readonly Fao56SoilLayer[]): void {
  if (layers.length === 0) throw new RangeError("At least one soil layer is required.");
  let expectedTopDepthMeters = 0;
  for (const layer of layers) {
    requireFiniteNonnegative(layer.topDepthMeters, "topDepthMeters");
    requireFiniteNonnegative(layer.bottomDepthMeters, "bottomDepthMeters");
    if (Math.abs(layer.topDepthMeters - expectedTopDepthMeters) > FAO56_NUMERIC_TOLERANCE) {
      throw new RangeError("Soil layers must be contiguous and start at zero depth.");
    }
    if (layer.bottomDepthMeters <= layer.topDepthMeters) {
      throw new RangeError("Soil layer bottom depth must be greater than top depth.");
    }
    requireFractionOrNull(
      layer.fieldCapacity10KpaVolumetricFraction,
      "fieldCapacity10KpaVolumetricFraction",
    );
    requireFractionOrNull(
      layer.fieldCapacity33KpaVolumetricFraction,
      "fieldCapacity33KpaVolumetricFraction",
    );
    requireFractionOrNull(layer.wiltingPointVolumetricFraction, "wiltingPointVolumetricFraction");
    expectedTopDepthMeters = layer.bottomDepthMeters;
  }
}

export function calculateLayeredTotalAvailableWaterMm(input: {
  soilLayers: readonly Fao56SoilLayer[];
  rootDepthMeters: number;
  fieldCapacity: Fao56FieldCapacityScenario;
}): number | null {
  requireFiniteNonnegative(input.rootDepthMeters, "rootDepthMeters");
  validateSoilLayers(input.soilLayers);
  const lastLayer = input.soilLayers.at(-1);
  if (!lastLayer || input.rootDepthMeters > lastLayer.bottomDepthMeters + FAO56_NUMERIC_TOLERANCE) {
    return null;
  }

  let totalAvailableWaterMm = 0;
  for (const layer of input.soilLayers) {
    const thicknessInRootZoneMeters =
      Math.min(input.rootDepthMeters, layer.bottomDepthMeters) - layer.topDepthMeters;
    if (thicknessInRootZoneMeters <= 0) continue;
    const fieldCapacityVolumetricFraction =
      input.fieldCapacity === "10-kpa"
        ? layer.fieldCapacity10KpaVolumetricFraction
        : layer.fieldCapacity33KpaVolumetricFraction;
    if (fieldCapacityVolumetricFraction === null || layer.wiltingPointVolumetricFraction === null) {
      return null;
    }
    if (fieldCapacityVolumetricFraction < layer.wiltingPointVolumetricFraction) return null;
    totalAvailableWaterMm +=
      1_000 *
      (fieldCapacityVolumetricFraction - layer.wiltingPointVolumetricFraction) *
      thicknessInRootZoneMeters;
  }
  return totalAvailableWaterMm;
}

function interpolate(
  start: number,
  end: number,
  completedDays: number,
  durationDays: number,
): number {
  return start + (end - start) * (completedDays / durationDays);
}

function cropStateForDay(
  dayOffset: number,
  phenology: Fao56PhenologyScenario,
  parameters: ParameterScenario,
): { growthStage: Fao56GrowthStage; cropCoefficient: number; rootDepthMeters: number } {
  const { durations } = phenology;
  if (dayOffset < durations.initialDays) {
    return {
      growthStage: "initial",
      cropCoefficient: parameters.cropCoefficientInitial,
      rootDepthMeters: phenology.initialRootDepthMeters,
    };
  }

  const developmentOffset = dayOffset - durations.initialDays;
  if (developmentOffset < durations.developmentDays) {
    const completedDays = developmentOffset + 1;
    return {
      growthStage: "development",
      cropCoefficient: interpolate(
        parameters.cropCoefficientInitial,
        parameters.cropCoefficientMidSeason,
        completedDays,
        durations.developmentDays,
      ),
      rootDepthMeters: interpolate(
        phenology.initialRootDepthMeters,
        parameters.maximumRootDepthMeters,
        completedDays,
        durations.developmentDays,
      ),
    };
  }

  const midSeasonOffset = developmentOffset - durations.developmentDays;
  if (midSeasonOffset < durations.midSeasonDays) {
    return {
      growthStage: "mid-season",
      cropCoefficient: parameters.cropCoefficientMidSeason,
      rootDepthMeters: parameters.maximumRootDepthMeters,
    };
  }

  const lateSeasonOffset = midSeasonOffset - durations.midSeasonDays;
  return {
    growthStage: "late-season",
    cropCoefficient: interpolate(
      parameters.cropCoefficientMidSeason,
      parameters.cropCoefficientLateSeason,
      lateSeasonOffset + 1,
      durations.lateSeasonDays,
    ),
    rootDepthMeters: parameters.maximumRootDepthMeters,
  };
}

function resolveFlux(
  value: number | null,
  policy: Fao56SeasonEngineInput["unknownFluxPolicy"],
): number | null {
  return value === null && policy === "assume-zero-and-report" ? 0 : value;
}

function buildStressEpisodes(days: readonly Fao56DailyResult[]): Fao56StressEpisode[] {
  const episodes: Fao56StressEpisode[] = [];
  let currentDays: Fao56DailyResult[] = [];
  const closeEpisode = () => {
    const first = currentDays[0];
    const last = currentDays.at(-1);
    if (!first || !last) return;
    const potentialCropEvapotranspirationMm = currentDays.reduce(
      (sum, day) => sum + day.potentialCropEvapotranspirationMm,
      0,
    );
    const adjustedCropEvapotranspirationMm = currentDays.reduce(
      (sum, day) => sum + day.adjustedCropEvapotranspirationMm,
      0,
    );
    episodes.push({
      startDate: first.date,
      endDate: last.date,
      durationDays: currentDays.length,
      minimumWaterStressCoefficient: Math.min(
        ...currentDays.map(({ waterStressCoefficient }) => waterStressCoefficient),
      ),
      potentialCropEvapotranspirationMm,
      adjustedCropEvapotranspirationMm,
      evapotranspirationDeficitMm:
        potentialCropEvapotranspirationMm - adjustedCropEvapotranspirationMm,
    });
    currentDays = [];
  };

  for (const day of days) {
    if (day.waterStressCoefficient < 1 - FAO56_NUMERIC_TOLERANCE) currentDays.push(day);
    else closeEpisode();
  }
  closeEpisode();
  return episodes;
}

function summarizeScenario(
  days: readonly Fao56DailyResult[],
  stressEpisodes: readonly Fao56StressEpisode[],
) {
  const lastDay = days.at(-1);
  const cumulativePotentialCropEvapotranspirationMm = days.reduce(
    (sum, day) => sum + day.potentialCropEvapotranspirationMm,
    0,
  );
  const cumulativeAdjustedCropEvapotranspirationMm = days.reduce(
    (sum, day) => sum + day.adjustedCropEvapotranspirationMm,
    0,
  );
  return {
    simulatedDays: days.length,
    stressDays: stressEpisodes.reduce((sum, episode) => sum + episode.durationDays, 0),
    longestStressEpisodeDays: Math.max(
      0,
      ...stressEpisodes.map(({ durationDays }) => durationDays),
    ),
    minimumWaterStressCoefficient:
      days.length === 0
        ? null
        : Math.min(...days.map(({ waterStressCoefficient }) => waterStressCoefficient)),
    finalWaterStressCoefficient: lastDay?.waterStressCoefficient ?? null,
    finalRootZoneDepletionMm: lastDay?.rootZoneDepletionAtEndMm ?? null,
    cumulativePotentialCropEvapotranspirationMm,
    cumulativeAdjustedCropEvapotranspirationMm,
    cumulativeEvapotranspirationDeficitMm:
      cumulativePotentialCropEvapotranspirationMm - cumulativeAdjustedCropEvapotranspirationMm,
    totalDeepPercolationMm: days.reduce((sum, day) => sum + day.deepPercolationMm, 0),
    maximumAbsoluteMassBalanceResidualMm: Math.max(
      0,
      ...days.map(({ massBalanceResidualMm }) => Math.abs(massBalanceResidualMm)),
    ),
  };
}

function buildScenarioConfiguration(input: {
  phenology: Fao56PhenologyScenario;
  parameters: ParameterScenario;
  fieldCapacity: Fao56FieldCapacityScenario;
  initialCondition: Fao56InitialCondition;
  wettingTiming: Fao56WettingTiming;
}): Fao56ScenarioConfiguration {
  const { phenology, parameters, fieldCapacity, initialCondition, wettingTiming } = input;
  return {
    id: [phenology.id, parameters.id, fieldCapacity, initialCondition, wettingTiming].join("__"),
    phenologyScenarioId: phenology.id,
    phenologyDescription: phenology.description,
    seasonStartDate: phenology.seasonStartDate,
    phenologySource: phenology.source,
    stageDurations: { ...phenology.durations },
    fieldCapacity,
    initialCondition,
    wettingTiming,
    cropCoefficientInitial: parameters.cropCoefficientInitial,
    cropCoefficientMidSeason: parameters.cropCoefficientMidSeason,
    cropCoefficientLateSeason: parameters.cropCoefficientLateSeason,
    initialRootDepthMeters: phenology.initialRootDepthMeters,
    maximumRootDepthMeters: parameters.maximumRootDepthMeters,
  };
}

function incompleteScenario(
  configuration: Fao56ScenarioConfiguration,
  days: readonly Fao56DailyResult[],
  issues: readonly Fao56ScenarioIssue[],
): Fao56ScenarioResult {
  const stressEpisodes = buildStressEpisodes(days);
  return {
    configuration,
    status: "incomplete",
    days,
    stressEpisodes,
    summary: summarizeScenario(days, stressEpisodes),
    issues,
  };
}

function simulateScenario(input: {
  engineInput: Fao56SeasonEngineInput;
  weatherByDate: ReadonlyMap<string, Fao56DailyWeather>;
  phenology: Fao56PhenologyScenario;
  parameters: ParameterScenario;
  fieldCapacity: Fao56FieldCapacityScenario;
  initialCondition: Fao56InitialCondition;
  wettingTiming: Fao56WettingTiming;
}): Fao56ScenarioResult {
  const { engineInput, weatherByDate, parameters, fieldCapacity, initialCondition } = input;
  const profile = findCropWaterProfile(engineInput.cropProfileId);
  // Established perennials retain their roots between canopy seasons.
  const phenology =
    profile.seasonType === "perennial"
      ? { ...input.phenology, initialRootDepthMeters: parameters.maximumRootDepthMeters }
      : input.phenology;
  const configuration = buildScenarioConfiguration({ ...input, phenology });
  const analysisOffset = dayDifference(phenology.seasonStartDate, engineInput.analysisDate);
  if (analysisOffset < 0) {
    return incompleteScenario(configuration, [], [{ code: "ANALYSIS_BEFORE_SEASON" }]);
  }
  if (analysisOffset >= totalSeasonDays(phenology.durations)) {
    return incompleteScenario(configuration, [], [{ code: "ANALYSIS_AFTER_MODELED_SEASON" }]);
  }
  if (phenology.initialRootDepthMeters > parameters.maximumRootDepthMeters) {
    return incompleteScenario(configuration, [], [{ code: "INVALID_ROOT_DEPTH_RANGE" }]);
  }

  const simulationDates = dateRange(phenology.seasonStartDate, engineInput.analysisDate);
  const days: Fao56DailyResult[] = [];
  let previousTotalAvailableWaterMm = calculateLayeredTotalAvailableWaterMm({
    soilLayers: engineInput.soilLayers,
    rootDepthMeters: phenology.initialRootDepthMeters,
    fieldCapacity,
  });
  if (previousTotalAvailableWaterMm === null) {
    const lastLayer = engineInput.soilLayers.at(-1);
    const code =
      lastLayer && phenology.initialRootDepthMeters > lastLayer.bottomDepthMeters
        ? "ROOT_DEPTH_OUTSIDE_SOIL_PROFILE"
        : "MISSING_SOIL_VALUE";
    return incompleteScenario(configuration, [], [{ code, date: simulationDates[0] }]);
  }
  let previousRootZoneDepletionMm =
    initialCondition === "field-capacity" ? 0 : previousTotalAvailableWaterMm;

  for (const [dayOffset, date] of simulationDates.entries()) {
    const weather = weatherByDate.get(date);
    if (!weather) {
      return incompleteScenario(configuration, days, [{ code: "MISSING_WEATHER_DAY", date }]);
    }
    if (weather.precipitationMm === null || weather.referenceEvapotranspirationMm === null) {
      return incompleteScenario(configuration, days, [
        {
          code: "MISSING_WEATHER_VALUE",
          date,
          field:
            weather.precipitationMm === null ? "precipitationMm" : "referenceEvapotranspirationMm",
        },
      ]);
    }
    const runoffMm = resolveFlux(weather.runoffMm, engineInput.unknownFluxPolicy);
    const irrigationMm = resolveFlux(weather.irrigationMm, engineInput.unknownFluxPolicy);
    const capillaryRiseMm = resolveFlux(weather.capillaryRiseMm, engineInput.unknownFluxPolicy);
    if (runoffMm === null || irrigationMm === null || capillaryRiseMm === null) {
      return incompleteScenario(configuration, days, [
        {
          code: "MISSING_WEATHER_VALUE",
          date,
          field:
            runoffMm === null
              ? "runoffMm"
              : irrigationMm === null
                ? "irrigationMm"
                : "capillaryRiseMm",
        },
      ]);
    }

    const cropState = cropStateForDay(dayOffset, phenology, parameters);
    const totalAvailableWaterMm = calculateLayeredTotalAvailableWaterMm({
      soilLayers: engineInput.soilLayers,
      rootDepthMeters: cropState.rootDepthMeters,
      fieldCapacity,
    });
    if (totalAvailableWaterMm === null) {
      const lastLayer = engineInput.soilLayers.at(-1);
      const code =
        lastLayer && cropState.rootDepthMeters > lastLayer.bottomDepthMeters
          ? "ROOT_DEPTH_OUTSIDE_SOIL_PROFILE"
          : "MISSING_SOIL_VALUE";
      return incompleteScenario(configuration, days, [{ code, date }]);
    }
    const rootGrowthDepletionAdjustmentMm =
      initialCondition === "wilting-point"
        ? totalAvailableWaterMm - previousTotalAvailableWaterMm
        : 0;
    const step = calculateFao56DailyStep({
      previousRootZoneDepletionMm,
      totalAvailableWaterMm,
      rootGrowthDepletionAdjustmentMm,
      precipitationMm: weather.precipitationMm,
      runoffMm,
      irrigationMm,
      capillaryRiseMm,
      wettingTiming: input.wettingTiming,
      referenceEvapotranspirationMm: weather.referenceEvapotranspirationMm,
      cropCoefficient: cropState.cropCoefficient,
      depletionFractionAtFiveMillimeters: profile.depletionFractionAtFiveMillimetersPerDay,
      depletionFractionMode: engineInput.depletionFractionMode,
    });
    const actualCropEvapotranspirationMm =
      step.adjustedCropEvapotranspirationMm - step.unmetCropEvapotranspirationMm;
    const expectedEndDepletionMm =
      previousRootZoneDepletionMm +
      rootGrowthDepletionAdjustmentMm -
      (weather.precipitationMm - runoffMm) -
      irrigationMm -
      capillaryRiseMm +
      actualCropEvapotranspirationMm +
      step.deepPercolationMm;
    const massBalanceResidualMm = step.rootZoneDepletionMm - expectedEndDepletionMm;
    if (Math.abs(massBalanceResidualMm) > MASS_BALANCE_TOLERANCE_MM) {
      throw new RangeError("Daily water balance did not conserve mass.");
    }

    days.push({
      date,
      dayOfSeason: dayOffset + 1,
      growthStage: cropState.growthStage,
      cropCoefficient: cropState.cropCoefficient,
      rootDepthMeters: cropState.rootDepthMeters,
      totalAvailableWaterMm,
      readilyAvailableWaterMm: step.readilyAvailableWaterMm,
      depletionFraction: step.adjustedDepletionFraction,
      rootGrowthDepletionAdjustmentMm,
      rootZoneDepletionAtStartMm: step.rootZoneDepletionAtStartMm,
      rootZoneDepletionAtEndMm: step.rootZoneDepletionMm,
      waterStressCoefficient: step.waterStressCoefficient,
      referenceEvapotranspirationMm: weather.referenceEvapotranspirationMm,
      potentialCropEvapotranspirationMm: step.potentialCropEvapotranspirationMm,
      adjustedCropEvapotranspirationMm: step.adjustedCropEvapotranspirationMm,
      actualCropEvapotranspirationMm,
      precipitationMm: weather.precipitationMm,
      runoffMm,
      irrigationMm,
      capillaryRiseMm,
      deepPercolationMm: step.deepPercolationMm,
      unmetCropEvapotranspirationMm: step.unmetCropEvapotranspirationMm,
      massBalanceResidualMm,
    });
    previousRootZoneDepletionMm = step.rootZoneDepletionMm;
    previousTotalAvailableWaterMm = totalAvailableWaterMm;
  }

  const stressEpisodes = buildStressEpisodes(days);
  return {
    configuration,
    status: "complete",
    days,
    stressEpisodes,
    summary: summarizeScenario(days, stressEpisodes),
    issues: [],
  };
}

function numericRange(values: readonly number[]): { minimum: number; maximum: number } | null {
  return values.length === 0
    ? null
    : { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function convergenceKey(configuration: Fao56ScenarioConfiguration): string {
  return [
    configuration.phenologyScenarioId,
    configuration.fieldCapacity,
    configuration.wettingTiming,
    configuration.cropCoefficientInitial,
    configuration.cropCoefficientMidSeason,
    configuration.cropCoefficientLateSeason,
    configuration.initialRootDepthMeters,
    configuration.maximumRootDepthMeters,
  ].join("|");
}

function calculateInitialConditionConvergence(scenarios: readonly Fao56ScenarioResult[]) {
  const groups = new Map<string, Fao56ScenarioResult[]>();
  for (const scenario of scenarios) {
    const key = convergenceKey(scenario.configuration);
    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }

  let evaluatedPairs = 0;
  let pairsWithSameStressConclusion = 0;
  let pairsWithNumericallyConvergedState = 0;
  const depletionDifferences: number[] = [];
  const coefficientDifferences: number[] = [];
  for (const group of groups.values()) {
    const wet = group.find(
      ({ configuration, status }) =>
        configuration.initialCondition === "field-capacity" && status === "complete",
    );
    const dry = group.find(
      ({ configuration, status }) =>
        configuration.initialCondition === "wilting-point" && status === "complete",
    );
    if (!wet || !dry) continue;
    const wetKs = wet.summary.finalWaterStressCoefficient;
    const dryKs = dry.summary.finalWaterStressCoefficient;
    const wetDepletion = wet.summary.finalRootZoneDepletionMm;
    const dryDepletion = dry.summary.finalRootZoneDepletionMm;
    if (wetKs === null || dryKs === null || wetDepletion === null || dryDepletion === null)
      continue;
    evaluatedPairs += 1;
    const wetShowsStress = wetKs < 1 - FAO56_NUMERIC_TOLERANCE;
    const dryShowsStress = dryKs < 1 - FAO56_NUMERIC_TOLERANCE;
    if (wetShowsStress === dryShowsStress) pairsWithSameStressConclusion += 1;
    const depletionDifference = Math.abs(wetDepletion - dryDepletion);
    const coefficientDifference = Math.abs(wetKs - dryKs);
    depletionDifferences.push(depletionDifference);
    coefficientDifferences.push(coefficientDifference);
    if (
      depletionDifference <= MASS_BALANCE_TOLERANCE_MM &&
      coefficientDifference <= FAO56_NUMERIC_TOLERANCE
    ) {
      pairsWithNumericallyConvergedState += 1;
    }
  }

  return {
    evaluatedPairs,
    pairsWithSameStressConclusion,
    pairsWithNumericallyConvergedState,
    maximumFinalDepletionDifferenceMm:
      depletionDifferences.length === 0 ? null : Math.max(...depletionDifferences),
    maximumFinalWaterStressCoefficientDifference:
      coefficientDifferences.length === 0 ? null : Math.max(...coefficientDifferences),
  };
}

export function simulateFao56Season(input: Fao56SeasonEngineInput): Fao56SeasonEngineResult {
  parseCalendarDate(input.analysisDate);
  validateSoilLayers(input.soilLayers);
  findCropWaterProfile(input.cropProfileId);
  const weatherByDate = new Map<string, Fao56DailyWeather>();
  for (const weather of input.dailyWeather) {
    parseCalendarDate(weather.date);
    if (weatherByDate.has(weather.date)) {
      throw new RangeError(`Duplicate daily weather date: ${weather.date}`);
    }
    weatherByDate.set(weather.date, weather);
  }
  const phenologyIds = new Set<string>();
  for (const phenology of input.phenologyScenarios) {
    parseCalendarDate(phenology.seasonStartDate);
    validateDurations(phenology.durations);
    requireFiniteNonnegative(phenology.initialRootDepthMeters, "initialRootDepthMeters");
    if (phenologyIds.has(phenology.id)) {
      throw new RangeError(`Duplicate phenology scenario id: ${phenology.id}`);
    }
    phenologyIds.add(phenology.id);
  }

  const wettingTimings: readonly Fao56WettingTiming[] =
    input.wettingTiming === "unknown" ? ["early-day", "late-day"] : [input.wettingTiming];
  const parameterScenarios = buildParameterScenarios(input.cropProfileId);
  const scenarios: Fao56ScenarioResult[] = [];
  for (const phenology of input.phenologyScenarios) {
    for (const parameters of parameterScenarios) {
      for (const fieldCapacity of ["10-kpa", "33-kpa"] as const) {
        for (const initialCondition of ["field-capacity", "wilting-point"] as const) {
          for (const wettingTiming of wettingTimings) {
            scenarios.push(
              simulateScenario({
                engineInput: input,
                weatherByDate,
                phenology,
                parameters,
                fieldCapacity,
                initialCondition,
                wettingTiming,
              }),
            );
          }
        }
      }
    }
  }

  const balanceAssessment = assessFao56Balance({
    scenarioResults:
      scenarios.length === 0
        ? []
        : scenarios.map((scenario) => ({
            id: scenario.configuration.id,
            fieldCapacity: scenario.configuration.fieldCapacity,
            waterStressCoefficient:
              scenario.status === "complete" ? scenario.summary.finalWaterStressCoefficient : null,
          })),
  });
  const completeScenarios = scenarios.filter(
    (scenario): scenario is Fao56ScenarioResult & { status: "complete" } =>
      scenario.status === "complete",
  );
  const finalKs = completeScenarios.flatMap(({ summary }) =>
    summary.finalWaterStressCoefficient === null ? [] : [summary.finalWaterStressCoefficient],
  );
  const finalDepletion = completeScenarios.flatMap(({ summary }) =>
    summary.finalRootZoneDepletionMm === null ? [] : [summary.finalRootZoneDepletionMm],
  );
  const unknownFluxesAssumedZero =
    input.unknownFluxPolicy === "assume-zero-and-report" &&
    input.dailyWeather.some(
      ({ runoffMm, irrigationMm, capillaryRiseMm }) =>
        runoffMm === null || irrigationMm === null || capillaryRiseMm === null,
    );
  const limitations: Fao56SeasonEngineResult["limitations"][number][] = [
    "SINGLE_CROP_COEFFICIENT_APPROXIMATION",
    "MODELLED_SOIL_PROPERTIES",
    "INITIAL_SUBSOIL_WATER_BRACKETED_BY_EXTREMES",
    "STRONG_CLASSIFICATION_DISABLED",
  ];
  if (
    input.phenologyScenarios.some(
      ({ source }) => source === "fao56-reference" || source === "project-adapted-reference",
    )
  ) {
    limitations.push("PHENOLOGY_NOT_POLAND_CALIBRATED");
  }
  if (input.wettingTiming === "unknown") limitations.push("UNKNOWN_WETTING_TIME_BRACKETED");
  if (unknownFluxesAssumedZero) limitations.push("UNKNOWN_FLUXES_ASSUMED_ZERO");

  return {
    status:
      balanceAssessment.balanceClassification === "insufficient-data"
        ? "insufficient-data"
        : balanceAssessment.balanceClassification === "indeterminate"
          ? "indeterminate"
          : "complete",
    cropProfileId: input.cropProfileId,
    analysisDate: input.analysisDate,
    assumptions: {
      depletionFractionMode: input.depletionFractionMode,
      unknownFluxPolicy: input.unknownFluxPolicy,
      requestedWettingTiming: input.wettingTiming,
    },
    balanceAssessment,
    scenarios,
    spread: {
      completeScenarioCount: completeScenarios.length,
      incompleteScenarioCount: scenarios.length - completeScenarios.length,
      finalWaterStressCoefficient: numericRange(finalKs),
      finalRootZoneDepletionMm: numericRange(finalDepletion),
      stressDays: numericRange(completeScenarios.map(({ summary }) => summary.stressDays)),
      cumulativeEvapotranspirationDeficitMm: numericRange(
        completeScenarios.map(({ summary }) => summary.cumulativeEvapotranspirationDeficitMm),
      ),
    },
    initialConditionConvergence: calculateInitialConditionConvergence(scenarios),
    limitations,
  };
}
