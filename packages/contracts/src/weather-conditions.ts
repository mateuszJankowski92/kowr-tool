import { z } from "zod";
import { AnalysisDateSelectionSchema } from "./analysis.js";
import { CropSchema } from "./crops.js";
import { ParcelGeometrySchema } from "./parcels.js";

export const WeatherPeriodPresetSchema = z.enum(["7-days", "30-days", "90-days", "season"]);

export const WeatherConditionsRequestSchema = z.strictObject({
  geometry: ParcelGeometrySchema,
  dateSelection: AnalysisDateSelectionSchema,
  crop: CropSchema,
  periodPreset: WeatherPeriodPresetSchema.optional(),
});

const NullableMeasurementSchema = z.number().finite().nullable();

export const WeatherDaySchema = z.strictObject({
  date: z.iso.date(),
  precipitationMm: z.number().nonnegative().nullable(),
  et0Mm: z.number().nonnegative().nullable(),
  temperatureMeanCelsius: NullableMeasurementSchema,
  temperatureMinCelsius: NullableMeasurementSchema,
  temperatureMaxCelsius: NullableMeasurementSchema,
  solarRadiationMjPerM2: z.number().nonnegative().nullable(),
});

export const WeatherPeriodSummarySchema = z.strictObject({
  precipitationMm: z.number().nonnegative().nullable(),
  et0Mm: z.number().nonnegative().nullable(),
  differenceMm: z.number().nullable(),
  precipitationAvailableDayCount: z.number().int().nonnegative(),
  et0AvailableDayCount: z.number().int().nonnegative(),
  expectedDayCount: z.number().int().positive(),
  precipitationComplete: z.boolean(),
  et0Complete: z.boolean(),
});

export const WeatherHistoryPeriodSchema = z.strictObject({
  year: z.number().int(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  precipitationMm: z.number().nonnegative().nullable(),
  et0Mm: z.number().nonnegative().nullable(),
  differenceMm: z.number().nullable(),
  precipitationComplete: z.boolean(),
  et0Complete: z.boolean(),
  complete: z.boolean(),
  selected: z.boolean(),
});

export const PrecipitationTimelinePointSchema = z.strictObject({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  precipitationMm: z.number().nonnegative().nullable(),
  availableDayCount: z.number().int().nonnegative(),
  expectedDayCount: z.number().int().positive(),
  complete: z.boolean(),
  solarRadiationMjPerM2: z.number().nonnegative().nullable(),
  solarRadiationAvailableDayCount: z.number().int().nonnegative(),
  historicalMedianMm: z.number().nonnegative().nullable(),
  differenceFromHistoricalMedianMm: z.number().nullable(),
  historicalCompletePeriodCount: z.number().int().nonnegative(),
  historicalComparisonPeriodCount: z.number().int().nonnegative(),
  historicalPeriods: z.array(
    z.strictObject({
      year: z.number().int(),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      precipitationMm: z.number().nonnegative().nullable(),
      availableDayCount: z.number().int().nonnegative(),
      expectedDayCount: z.number().int().positive(),
      complete: z.boolean(),
    }),
  ),
});

export const WeatherSourceSchema = z.strictObject({
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

export const WeatherConditionsResponseSchema = z.strictObject({
  status: z.enum(["complete", "partial"]),
  period: z.strictObject({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    expectedDayCount: z.number().int().positive(),
    label: z.string().min(1),
  }),
  summary: WeatherPeriodSummarySchema,
  daily: z.array(WeatherDaySchema),
  precipitationTimeline: z.strictObject({
    aggregation: z.enum(["daily", "weekly", "monthly"]),
    points: z.array(PrecipitationTimelinePointSchema),
    lowerThanHistoricalMedianCount: z.number().int().nonnegative(),
    comparablePointCount: z.number().int().nonnegative(),
    totalPointCount: z.number().int().nonnegative(),
  }),
  history: z.array(WeatherHistoryPeriodSchema).min(1),
  precipitationReference: z.strictObject({
    classification: z.enum(["lower", "typical", "higher", "unavailable"]),
    medianMm: z.number().nonnegative().nullable(),
    q25Mm: z.number().nonnegative().nullable(),
    q75Mm: z.number().nonnegative().nullable(),
    completePeriodCount: z.number().int().nonnegative(),
    comparisonPeriodCount: z.number().int().nonnegative(),
    comparisonPeriod: z
      .strictObject({
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        dayCount: z.number().int().positive(),
      })
      .nullable(),
  }),
  reference: z.strictObject({
    medianDifferenceMm: z.number().nullable(),
    q25DifferenceMm: z.number().nullable(),
    q75DifferenceMm: z.number().nullable(),
    completePeriodCount: z.number().int().nonnegative(),
    comparisonPeriodCount: z.number().int().nonnegative(),
  }),
  sample: z.strictObject({
    location: z.strictObject({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    }),
    method: z.literal("representative-interior-point"),
  }),
  source: WeatherSourceSchema,
  limitations: z.array(z.string().min(1)),
});

export type WeatherConditionsRequest = z.infer<typeof WeatherConditionsRequestSchema>;
export type WeatherConditionsResponse = z.infer<typeof WeatherConditionsResponseSchema>;
export type WeatherDay = z.infer<typeof WeatherDaySchema>;
export type WeatherPeriodPreset = z.infer<typeof WeatherPeriodPresetSchema>;
export type WeatherPeriodSummary = z.infer<typeof WeatherPeriodSummarySchema>;
export type WeatherSource = z.infer<typeof WeatherSourceSchema>;
