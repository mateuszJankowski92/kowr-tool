import { z } from "zod";

export const PhenologyReferenceSourceSchema = z.strictObject({
  provider: z.string().min(1),
  dataset: z.string().min(1),
  version: z.string().min(1),
  sourceUrl: z.url(),
  accessedOn: z.iso.date(),
  supportingSourceUrl: z.url().optional(),
  adaptation: z.string().min(1).optional(),
});

import { AnalysisRequestSchema } from "./analysis.js";
import { CropModelKindSchema } from "./crop-model-capabilities.js";
import { CropSchema } from "./crops.js";

const GrowthStageDurationsSchema = z.strictObject({
  initialDays: z.number().int().positive().max(400),
  developmentDays: z.number().int().positive().max(400),
  midSeasonDays: z.number().int().positive().max(400),
  lateSeasonDays: z.number().int().positive().max(400),
});

const ReferencePhenologyRequestSchema = z.strictObject({
  method: z.literal("fao56-reference"),
  seasonStartDates: z.array(z.iso.date()).min(1).max(2),
  initialRootDepthMeters: z.number().positive().max(2),
});

const ExplicitPhenologyRequestSchema = z.strictObject({
  method: z.literal("explicit-scenarios"),
  scenarios: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1).max(80),
        seasonStartDate: z.iso.date(),
        durations: GrowthStageDurationsSchema,
        initialRootDepthMeters: z.number().positive().max(2),
        source: z.enum(["local-observation", "user-supplied"]),
        description: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(4),
});

export const WaterAssessmentRequestSchema = z.strictObject({
  parcel: AnalysisRequestSchema.shape.parcel,
  crop: CropSchema,
  analysisDate: z.iso.date(),
  phenology: z
    .discriminatedUnion("method", [ReferencePhenologyRequestSchema, ExplicitPhenologyRequestSchema])
    .optional(),
  wettingTiming: z.enum(["early-day", "late-day", "unknown"]).optional(),
  includeSatellite: z.boolean().optional(),
});

export const WaterAssessmentStatusSchema = z.enum([
  "complete",
  "indeterminate",
  "insufficient-data",
]);

export const WaterAssessmentLevelSchema = z.enum([
  "full-fao56",
  "assumption-dependent",
  "limited-fao56",
  "weather-context-only",
  "unavailable",
]);

export const WaterAssessmentDataAvailabilitySchema = z.enum(["complete", "partial", "unavailable"]);

export const WaterAssessmentReasonCodeSchema = z.enum([
  "CROP_PROFILE_UNSUPPORTED",
  "PHENOLOGY_REQUIRED",
  "PHENOLOGY_REFERENCE_UNAVAILABLE",
  "ANALYSIS_OUTSIDE_MODELED_SEASON",
  "WEATHER_UNAVAILABLE",
  "WEATHER_SERIES_INCOMPLETE",
  "SOIL_PROFILE_UNAVAILABLE",
  "SOIL_PROFILE_INCOMPLETE",
  "MODELLED_STRESS_IN_ALL_SCENARIOS",
  "NO_MODELLED_STRESS_IN_ALL_SCENARIOS",
  "SCENARIO_CONCLUSIONS_DISAGREE",
  "REQUIRED_SCENARIO_INCOMPLETE",
  "SATELLITE_UNAVAILABLE",
]);

export const WaterAssessmentLimitationSchema = z.enum([
  "SINGLE_CROP_COEFFICIENT_APPROXIMATION",
  "MODELLED_SOIL_PROPERTIES",
  "PHENOLOGY_NOT_POLAND_CALIBRATED",
  "INITIAL_SUBSOIL_WATER_BRACKETED_BY_EXTREMES",
  "UNKNOWN_WETTING_TIME_BRACKETED",
  "UNKNOWN_FLUXES_ASSUMED_ZERO",
  "STRONG_CLASSIFICATION_DISABLED",
  "RAINFED_FULL_INFILTRATION_ASSUMPTION",
  "WEATHER_POINT_MODEL",
  "WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS",
  "WEATHER_SERIES_INCOMPLETE",
  "WEATHER_FALLBACK_TIME_STANDARD_DIFFERS",
  "SOIL_SINGLE_MODEL_CELL",
  "SOIL_NOT_CURRENT_MOISTURE",
  "SOIL_NOT_DATE_SPECIFIC",
  "HISTORICAL_CROP_NOT_CONFIRMED",
  "ANALYSIS_DAY_WEATHER_ONLY",
  "SATELLITE_NOT_USED_IN_BALANCE",
]);

const NullableRangeSchema = z
  .strictObject({
    minimum: z.number().finite(),
    maximum: z.number().finite(),
  })
  .nullable();

const WeatherSourceSchema = z.strictObject({
  id: z.string().min(1),
  provider: z.enum(["Open-Meteo", "NASA POWER"]),
  dataset: z.string().min(1),
  model: z.string().min(1),
  spatialResolution: z.string().min(1),
  timeStandard: z.string().min(1),
  license: z.string().min(1),
  sourceUrl: z.url(),
  retrievedAt: z.iso.datetime({ offset: true }),
});

const SourceMetadataSchema = z.strictObject({
  kind: z.enum(["parcel", "weather", "soil", "satellite"]),
  provider: z.string().min(1),
  dataset: z.string().min(1).nullable(),
  sourceUrl: z.url().nullable(),
  retrievedAt: z.iso.datetime({ offset: true }),
  dataFrom: z.iso.date().nullable(),
  dataTo: z.iso.date().nullable(),
  timeStandard: z.string().min(1).nullable(),
});

const StressEpisodeSchema = z.strictObject({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  durationDays: z.number().int().positive(),
  minimumWaterStressCoefficient: z.number().min(0).max(1),
  potentialCropEvapotranspirationMm: z.number().nonnegative(),
  adjustedCropEvapotranspirationMm: z.number().nonnegative(),
  evapotranspirationDeficitMm: z.number().nonnegative(),
});

const ScenarioResultSchema = z.strictObject({
  id: z.string().min(1),
  status: z.enum(["complete", "incomplete"]),
  configuration: z.strictObject({
    phenologyScenarioId: z.string().min(1),
    phenologyDescription: z.string().min(1),
    seasonStartDate: z.iso.date(),
    phenologySource: z.enum([
      "fao56-reference",
      "project-adapted-reference",
      "local-observation",
      "user-supplied",
    ]),
    stageDurations: GrowthStageDurationsSchema,
    fieldCapacity: z.enum(["10-kpa", "33-kpa"]),
    initialCondition: z.enum(["field-capacity", "wilting-point"]),
    wettingTiming: z.enum(["early-day", "late-day"]),
    cropCoefficientInitial: z.number().nonnegative(),
    cropCoefficientMidSeason: z.number().nonnegative(),
    cropCoefficientLateSeason: z.number().nonnegative(),
    initialRootDepthMeters: z.number().nonnegative(),
    maximumRootDepthMeters: z.number().nonnegative(),
  }),
  issues: z.array(
    z.strictObject({
      code: z.enum([
        "ANALYSIS_BEFORE_SEASON",
        "ANALYSIS_AFTER_MODELED_SEASON",
        "INVALID_ROOT_DEPTH_RANGE",
        "MISSING_WEATHER_DAY",
        "MISSING_WEATHER_VALUE",
        "MISSING_SOIL_VALUE",
        "ROOT_DEPTH_OUTSIDE_SOIL_PROFILE",
      ]),
      date: z.iso.date().optional(),
      field: z.string().min(1).optional(),
    }),
  ),
  summary: z.strictObject({
    simulatedDays: z.number().int().nonnegative(),
    stressDays: z.number().int().nonnegative(),
    longestStressEpisodeDays: z.number().int().nonnegative(),
    minimumWaterStressCoefficient: z.number().min(0).max(1).nullable(),
    finalWaterStressCoefficient: z.number().min(0).max(1).nullable(),
    finalRootZoneDepletionMm: z.number().nonnegative().nullable(),
    cumulativePotentialCropEvapotranspirationMm: z.number().nonnegative(),
    cumulativeAdjustedCropEvapotranspirationMm: z.number().nonnegative(),
    cumulativeEvapotranspirationDeficitMm: z.number().nonnegative(),
    totalDeepPercolationMm: z.number().nonnegative(),
    maximumAbsoluteMassBalanceResidualMm: z.number().nonnegative(),
  }),
  stressEpisodes: z.array(StressEpisodeSchema),
});

export const CropAssessmentPeriodSchema = z.strictObject({
  scope: z.enum(["analysis-day", "completed-season"]),
  evaluatedThroughDate: z.iso.date(),
});

const SeasonAssessmentResponseSchema = z.strictObject({
  status: WaterAssessmentStatusSchema,
  assessmentLevel: WaterAssessmentLevelSchema,
  dataAvailability: WaterAssessmentDataAvailabilitySchema,
  availableScenarioConclusion: z
    .enum(["consistent-no-stress", "consistent-stress", "scenario-disagreement"])
    .nullable(),
  analysisDate: z.iso.date(),
  requestedDateConditions: z
    .strictObject({
      date: z.iso.date(),
      ongoingDay: z.boolean(),
      cropAssessment: z.enum(["fao56", "outside-modelled-season", "unavailable"]),
      status: z.enum(["complete", "partial", "unavailable"]),
      period: z.strictObject({
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        expectedDayCount: z.literal(30),
      }),
      precipitationDayCount: z.number().int().min(0).max(30),
      et0DayCount: z.number().int().min(0).max(30),
      precipitationMm: z.number().nonnegative().nullable(),
      referenceEvapotranspirationMm: z.number().nonnegative().nullable(),
      differenceMm: z.number().nullable(),
      signal: z.enum([
        "incomplete",
        "precipitation-below-reference-et0",
        "precipitation-at-least-reference-et0",
      ]),
      day: z.strictObject({
        precipitationMm: z.number().nonnegative().nullable(),
        referenceEvapotranspirationMm: z.number().nonnegative().nullable(),
      }),
      source: WeatherSourceSchema.nullable(),
    })
    .optional(),
  evaluation: CropAssessmentPeriodSchema.optional(),
  parcel: z.strictObject({
    identifier: z.string().min(1),
    parcelNumber: z.string().min(1),
  }),
  crop: z.strictObject({
    arimrId: CropSchema,
    modelKind: CropModelKindSchema,
    profileId: z.string().min(1).nullable(),
    profileLabel: z.string().min(1).optional(),
    profileAssumptions: z.array(z.string().min(1)).optional(),
    supported: z.boolean(),
  }),
  phenology: z.strictObject({
    status: z.enum([
      "ready",
      "partially-active",
      "missing",
      "unsupported-crop",
      "reference-unavailable",
      "outside-active-season",
    ]),
    scenarioCount: z.number().int().nonnegative(),
    activeScenarioCount: z.number().int().nonnegative(),
    basis: z.enum(["project-standard", "request"]).nullable().optional(),
    seasonStartDates: z.array(z.iso.date()).max(4).optional(),
    referenceSource: PhenologyReferenceSourceSchema.optional(),
  }),
  balance: z.strictObject({
    classification: z
      .enum([
        "no-significant-shortage-indications",
        "elevated-shortage-risk",
        "strong-shortage-indications",
        "indeterminate",
        "insufficient-data",
      ])
      .nullable(),
    scenarioConsensus: z
      .enum([
        "consistent-no-stress",
        "consistent-stress",
        "consistent-complete-depletion",
        "scenario-disagreement",
        "insufficient-data",
      ])
      .nullable(),
    reason: z
      .enum([
        "core-scenarios-show-no-stress",
        "core-scenarios-show-stress",
        "core-scenarios-reach-complete-depletion",
        "core-scenarios-disagree",
        "required-core-scenario-missing",
      ])
      .nullable(),
  }),
  reasonCodes: z.array(WaterAssessmentReasonCodeSchema),
  weather: z.strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    purpose: z.enum(["fao56-season", "analysis-day-context"]),
    period: z.strictObject({
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      expectedDayCount: z.number().int().positive(),
    }),
    precipitationAvailableDayCount: z.number().int().nonnegative(),
    et0AvailableDayCount: z.number().int().nonnegative(),
    completeDayCount: z.number().int().nonnegative(),
    missingDays: z.array(
      z.strictObject({
        date: z.iso.date(),
        fields: z.array(z.enum(["precipitation", "et0"])).min(1),
        cause: z.enum(["not-yet-published", "missing-date", "missing-variable"]),
      }),
    ),
    latestContiguousCompleteDate: z.iso.date().nullable(),
    latestCompleteAssessmentDate: z.iso.date().nullable().optional(),
    source: WeatherSourceSchema.nullable(),
    attempts: z.array(
      z.strictObject({
        providerRole: z.enum(["primary", "fallback"]),
        providerId: z.string().min(1).optional(),
        outcome: z.enum(["complete", "partial", "failed"]),
        errorCode: z
          .enum([
            "INVALID_RESPONSE",
            "RATE_LIMITED",
            "PROVIDER_UNAVAILABLE",
            "REQUEST_FAILED",
            "TIMEOUT",
            "UNKNOWN",
          ])
          .optional(),
      }),
    ),
  }),
  soil: z.strictObject({
    status: z.enum(["complete", "partial", "no-data", "unavailable"]),
    usableWaterLayerCount: z.number().int().nonnegative().max(6),
    source: z
      .strictObject({
        provider: z.literal("ISRIC"),
        dataset: z.literal("SoilGrids250m 2.0"),
        resolutionMeters: z.literal(250),
        predictionStatistic: z.literal("Q0.50"),
        uncertaintyInterval: z.literal("Q0.05-Q0.95"),
        license: z.literal("CC BY 4.0"),
        sourceUrl: z.url(),
        retrievedAt: z.iso.datetime({ offset: true }),
      })
      .nullable(),
  }),
  scenarios: z.strictObject({
    totalCount: z.number().int().nonnegative(),
    completeCount: z.number().int().nonnegative(),
    finalWaterStressCoefficient: NullableRangeSchema,
    finalRootZoneDepletionMm: NullableRangeSchema,
    stressDays: NullableRangeSchema,
    cumulativeEvapotranspirationDeficitMm: NullableRangeSchema,
    initialConditionConvergence: z.strictObject({
      evaluatedPairs: z.number().int().nonnegative(),
      pairsWithSameStressConclusion: z.number().int().nonnegative(),
      pairsWithNumericallyConvergedState: z.number().int().nonnegative(),
      maximumFinalDepletionDifferenceMm: z.number().nonnegative().nullable(),
      maximumFinalWaterStressCoefficientDifference: z.number().nonnegative().nullable(),
    }),
    families: z.array(
      z.strictObject({
        phenologyScenarioId: z.string().min(1),
        fieldCapacity: z.enum(["10-kpa", "33-kpa"]),
        status: z.enum(["complete", "partial", "unavailable"]),
        completeCount: z.number().int().nonnegative(),
        totalCount: z.number().int().positive(),
        canChangeConclusion: z.boolean(),
      }),
    ),
    results: z.array(ScenarioResultSchema),
  }),
  satellite: z.strictObject({
    status: z.enum(["not-requested", "available", "limited", "unavailable"]),
    signal: z.enum([
      "pattern-compatible-with-shortage",
      "pattern-incompatible-with-shortage",
      "neutral",
      "unavailable",
      "not-qualified",
    ]),
    consistency: z.enum([
      "consistent-with-balance",
      "conflicts-with-balance",
      "neutral",
      "unavailable",
      "not-qualified",
      "not-comparable",
    ]),
    limitsInterpretation: z.boolean(),
    interpretationReason: z.enum([
      "not-requested",
      "provider-unavailable",
      "limited-observation-quality",
      "observation-too-old",
      "phenology-unavailable",
      "outside-comparable-growth-stage",
      "insufficient-trend",
      "no-clear-trend",
      "decreasing-mid-season-ndmi",
      "increasing-mid-season-ndmi",
    ]),
    observationDate: z.iso.date().nullable(),
    reason: z
      .enum([
        "not-requested",
        "no-observations",
        "no-index-values",
        "partial-coverage",
        "statistics-unavailable",
        "provider-unavailable",
      ])
      .nullable(),
  }),
  assumptions: z.strictObject({
    depletionFractionMode: z.literal("adjust-for-etc"),
    unknownFluxPolicy: z.literal("assume-zero-and-report"),
    wettingTiming: z.enum(["early-day", "late-day", "unknown"]),
  }),
  limitations: z.array(WaterAssessmentLimitationSchema),
  sources: z.array(SourceMetadataSchema),
  timing: z.strictObject({
    totalMs: z.number().nonnegative(),
    parcelLookupMs: z.number().nonnegative(),
    weatherFetchMs: z.number().nonnegative(),
    soilFetchMs: z.number().nonnegative(),
    satelliteFetchMs: z.number().nonnegative().nullable(),
    simulationMs: z.number().nonnegative(),
  }),
});

export const WaterAssessmentResponseSchema = SeasonAssessmentResponseSchema.extend({
  completedSeason: SeasonAssessmentResponseSchema.optional(),
});

export type WaterAssessmentRequest = z.infer<typeof WaterAssessmentRequestSchema>;
export type WaterAssessmentResponse = z.infer<typeof WaterAssessmentResponseSchema>;
export type WaterAssessmentLevel = z.infer<typeof WaterAssessmentLevelSchema>;
export type WaterAssessmentReasonCode = z.infer<typeof WaterAssessmentReasonCodeSchema>;
export type WaterAssessmentLimitation = z.infer<typeof WaterAssessmentLimitationSchema>;
