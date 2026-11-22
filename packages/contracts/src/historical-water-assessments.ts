import { z } from "zod";
import { CropModelKindSchema } from "./crop-model-capabilities.js";
import { CropSchema } from "./crops.js";
import {
  CropAssessmentPeriodSchema,
  PhenologyReferenceSourceSchema,
  WaterAssessmentRequestSchema,
} from "./water-assessments.js";
import { WeatherSourceSchema } from "./weather-conditions.js";

const NumericRangeSchema = z.strictObject({
  minimum: z.number().finite(),
  maximum: z.number().finite(),
});

const CountRatioSchema = z.strictObject({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
});

export const HistoricalWaterAssessmentRequestSchema = z.strictObject({
  parcel: WaterAssessmentRequestSchema.shape.parcel,
  crop: CropSchema,
  analysisDate: WaterAssessmentRequestSchema.shape.analysisDate,
  phenology: WaterAssessmentRequestSchema.shape.phenology,
  wettingTiming: WaterAssessmentRequestSchema.shape.wettingTiming,
});

const WeatherAttemptSchema = z.strictObject({
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
});

const HistoricalSeasonSchema = z.strictObject({
  referenceYear: z.number().int(),
  periodStartDate: z.iso.date(),
  periodEndDate: z.iso.date(),
  status: z.enum(["complete", "incomplete"]),
  conclusion: z.enum(["modelled-stress", "no-modelled-stress", "ambiguous", "unavailable"]),
  finalDayConclusion: z.enum(["modelled-stress", "no-modelled-stress", "ambiguous", "unavailable"]),
  scenarios: z.strictObject({
    totalCount: z.number().int().nonnegative(),
    completeCount: z.number().int().nonnegative(),
    conclusionsAgree: z.boolean().nullable(),
  }),
  stressDays: NumericRangeSchema.nullable(),
  longestStressEpisodeDays: z.number().int().nonnegative().nullable(),
  longestStressEpisodeDaysRange: NumericRangeSchema.nullable(),
  minimumWaterStressCoefficient: z.number().min(0).max(1).nullable(),
  minimumWaterStressCoefficientRange: NumericRangeSchema.nullable(),
  finalWaterStressCoefficient: NumericRangeSchema.nullable(),
  cumulativeEvapotranspirationDeficitMm: NumericRangeSchema.nullable(),
  initialConditionSensitivity: z.strictObject({
    classification: z.enum(["no-material-influence", "dry-start-only", "material", "unavailable"]),
    evaluatedPairCount: z.number().int().nonnegative(),
    agreeingPairCount: z.number().int().nonnegative(),
    dryStartOnlyStressPairCount: z.number().int().nonnegative(),
    wetStartOnlyStressPairCount: z.number().int().nonnegative(),
    convergence: z.strictObject({
      classification: z.enum(["converged", "mixed", "persistent", "unavailable"]),
      convergedPairCount: z.number().int().nonnegative(),
      persistentPairCount: z.number().int().nonnegative(),
      firstConvergenceDay: NumericRangeSchema.nullable(),
    }),
  }),
  growthStages: z.array(
    z.strictObject({
      growthStage: z.enum(["initial", "development", "mid-season", "late-season"]),
      conclusion: z.enum(["modelled-stress", "no-modelled-stress", "ambiguous", "unavailable"]),
      completeScenarioCount: z.number().int().nonnegative(),
      stressDays: NumericRangeSchema.nullable(),
      longestStressEpisodeDays: z.number().int().nonnegative().nullable(),
      cumulativeEvapotranspirationDeficitMm: NumericRangeSchema.nullable(),
    }),
  ),
  incompleteReasonCodes: z.array(z.string().min(1)),
  weather: z.strictObject({
    status: z.enum(["complete", "partial", "unavailable"]),
    expectedDayCount: z.number().int().positive(),
    precipitationAvailableDayCount: z.number().int().nonnegative(),
    et0AvailableDayCount: z.number().int().nonnegative(),
    completeDayCount: z.number().int().nonnegative(),
    missingDays: z.array(
      z.strictObject({
        date: z.iso.date(),
        fields: z.array(z.enum(["precipitation", "et0"])).min(1),
      }),
    ),
    latestContiguousCompleteDate: z.iso.date().nullable(),
    source: WeatherSourceSchema.nullable(),
    attempts: z.array(WeatherAttemptSchema),
  }),
});

const RecurrenceSchema = z.strictObject({
  growthStages: z.array(
    z.strictObject({
      growthStage: z.enum(["initial", "development", "mid-season", "late-season"]),
      completeSeasonCount: z.number().int().nonnegative(),
      seasonsWithStress: z.number().int().nonnegative(),
      scenarioDependentSeasonCount: z.number().int().nonnegative(),
      seasonsWithoutStress: z.number().int().nonnegative(),
      stressScenarioDays: z.number().int().nonnegative(),
      eligibleScenarioDays: z.number().int().nonnegative(),
    }),
  ),
  mostAffectedDayPositions: z.array(
    z.strictObject({
      dayOfSeason: z.number().int().positive(),
      completeSeasonCount: z.number().int().nonnegative(),
      seasonsWithStress: z.number().int().nonnegative(),
      scenarioDependentSeasonCount: z.number().int().nonnegative(),
      seasonsWithoutStress: z.number().int().nonnegative(),
      stressScenarioDays: z.number().int().nonnegative(),
      eligibleScenarioDays: z.number().int().positive(),
    }),
  ),
});

export const HistoricalWaterAssessmentResponseSchema = z.strictObject({
  status: z.enum(["complete", "partial", "insufficient-data"]),
  analysisDate: z.iso.date(),
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
  phenology: z
    .strictObject({
      basis: z.enum(["project-standard", "request"]),
      seasonStartDates: z.array(z.iso.date()).max(4),
      referenceSource: PhenologyReferenceSourceSchema.optional(),
    })
    .optional(),
  referenceYears: z.array(z.number().int()).length(10),
  analogousSeasonRule: z.literal("same-phenology-shifted-by-whole-years"),
  leapDayRule: z.literal("clamp-to-last-day-of-february"),
  soil: z.strictObject({
    status: z.enum(["complete", "partial", "no-data", "unavailable"]),
    reusedForAllSeasons: z.literal(true),
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
  summary: z.strictObject({
    requiredSeasonCount: z.literal(10),
    completeSeasonCount: z.number().int().nonnegative().max(10),
    incompleteSeasonCount: z.number().int().nonnegative().max(10),
    seasonsWithModelledStress: z.number().int().nonnegative().max(10),
    seasonsWithoutModelledStress: z.number().int().nonnegative().max(10),
    ambiguousSeasonCount: z.number().int().nonnegative().max(10),
    stressOccurrence: CountRatioSchema,
    noStressOccurrence: CountRatioSchema,
    ambiguousOccurrence: CountRatioSchema,
    stressDaysRange: NumericRangeSchema.nullable(),
    medianStressDaysRange: NumericRangeSchema.nullable(),
    longestStressEpisodeDays: z.number().int().nonnegative().nullable(),
    actualDataPeriod: z.strictObject({ from: z.iso.date(), to: z.iso.date() }).nullable(),
  }),
  recurrence: RecurrenceSchema,
  seasons: z.array(HistoricalSeasonSchema).length(10),
  limitations: z.array(
    z.enum([
      "COUNTERFACTUAL_CURRENT_CROP_PROFILE",
      "HISTORICAL_CROP_ROTATION_NOT_CONFIRMED",
      "CURRENT_PARCEL_GEOMETRY_USED_FOR_HISTORY",
      "CURRENT_SOILGRIDS_MODEL_REUSED_FOR_HISTORY",
      "HISTORICAL_IRRIGATION_RUNOFF_AND_CAPILLARY_RISE_UNKNOWN",
      "MODELLED_SUSCEPTIBILITY_NOT_CONFIRMED_HISTORICAL_LOSS",
      "WEATHER_POINT_MODEL",
      "WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS",
      "SCENARIO_RANGES_ARE_NOT_CONFIDENCE_INTERVALS",
    ]),
  ),
  timing: z.strictObject({
    totalMs: z.number().nonnegative(),
    parcelLookupMs: z.number().nonnegative(),
    soilFetchMs: z.number().nonnegative(),
    weatherAndSimulationMs: z.number().nonnegative(),
    maximumWeatherConcurrency: z.literal(3),
  }),
});

export type HistoricalWaterAssessmentRequest = z.infer<
  typeof HistoricalWaterAssessmentRequestSchema
>;
export type HistoricalWaterAssessmentResponse = z.infer<
  typeof HistoricalWaterAssessmentResponseSchema
>;
