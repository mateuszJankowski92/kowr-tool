import { z } from "zod";
import { ParcelGeometrySchema } from "./parcels.js";

export const SatelliteIndicatorSchema = z.enum(["ndmi", "ndvi"]);
export const SatelliteLayerSchema = z.enum(["ndmi", "ndvi", "true-color"]);
export const SatelliteQualityAssessmentSchema = z.enum(["sufficient", "limited", "insufficient"]);

const CalendarDateSchema = z.iso.date();

export const SatelliteQualitySchema = z
  .object({
    assessment: SatelliteQualityAssessmentSchema,
    geometryPixelCount: z.number().int().positive(),
    thresholdPercent: z.number().min(0).max(100),
    validPixelCount: z.number().int().nonnegative(),
    rejectedPixelCounts: z
      .object({
        cloud: z.number().int().nonnegative(),
        cloudShadow: z.number().int().nonnegative(),
        noData: z.number().int().nonnegative(),
        other: z.number().int().nonnegative(),
        snow: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const SatelliteHistoryRequestSchema = z
  .object({
    geometry: ParcelGeometrySchema,
    indicator: SatelliteIndicatorSchema,
    throughDate: CalendarDateSchema,
    year: z.number().int().min(2016).max(2100),
  })
  .strict();

export const SatelliteObservationSchema = z
  .object({
    acquiredAt: z.iso.datetime({ offset: true }),
    date: CalendarDateSchema,
    id: z.string().min(1),
    median: z.number().min(-1).max(1).nullable(),
    sceneCloudPercent: z.number().min(0).max(100).nullable(),
    validPixelPercent: z.number().min(0).max(100).nullable(),
    quality: SatelliteQualitySchema.nullable(),
  })
  .strict();

export const SatelliteProvenanceSchema = z
  .object({
    collection: z.literal("sentinel-2-l2a"),
    license: z.string().min(1),
    provider: z.literal("Copernicus Data Space Ecosystem"),
    retrievedAt: z.iso.datetime({ offset: true }),
    sourceUrl: z.url(),
  })
  .strict();

export const SatelliteHistoryResponseSchema = z
  .object({
    indicator: SatelliteIndicatorSchema,
    limitations: z.array(z.string().min(1)),
    observations: z.array(SatelliteObservationSchema),
    provenance: SatelliteProvenanceSchema,
    status: z.enum(["complete", "partial"]),
    year: z.number().int(),
  })
  .strict();

export const SatelliteObservationSummaryRequestSchema = z
  .object({
    analysisDate: CalendarDateSchema,
    geometry: ParcelGeometrySchema,
  })
  .strict();

const SatelliteIndicatorMeasurementSchema = z
  .object({
    median: z.number().min(-1).max(1).nullable(),
    quality: SatelliteObservationSchema.shape.quality,
    validPixelPercent: z.number().min(0).max(100).nullable(),
  })
  .strict();

export const SatelliteVegetationHistoryPointSchema = z
  .object({
    date: CalendarDateSchema,
    ndmi: z.number().min(-1).max(1),
    quality: SatelliteQualitySchema,
    validPixelPercent: z.number().min(0).max(100),
  })
  .strict();

export const SatelliteObservationTrendSchema = z
  .object({
    direction: z.enum(["decreasing", "increasing", "insufficient", "no-clear-change"]),
    method: z.literal("mann-kendall-theil-sen"),
    observationCount: z.number().int().nonnegative(),
    pValue: z.number().min(0).max(1).nullable(),
    slopePerDay: z.number().nullable(),
  })
  .strict();

export const SatelliteCombinedObservationSchema = z
  .object({
    acquiredAt: z.iso.datetime({ offset: true }),
    date: CalendarDateSchema,
    id: z.string().min(1),
    indicators: z
      .object({
        ndmi: SatelliteIndicatorMeasurementSchema,
        ndvi: SatelliteIndicatorMeasurementSchema,
      })
      .strict(),
    sceneCloudPercent: z.number().min(0).max(100).nullable(),
  })
  .strict();

export const SatelliteObservationSummaryResponseSchema = z
  .object({
    analysisDate: CalendarDateSchema,
    history: z.array(SatelliteVegetationHistoryPointSchema),
    limitations: z.array(z.string().min(1)),
    provenance: SatelliteProvenanceSchema,
    reason: z
      .enum(["no-observations", "no-index-values", "partial-coverage", "statistics-unavailable"])
      .nullable(),
    searchPeriod: z
      .object({
        from: CalendarDateSchema,
        maxLookbackDays: z.number().int().positive(),
        to: CalendarDateSchema,
      })
      .strict(),
    selectedObservation: SatelliteCombinedObservationSchema.nullable(),
    status: z.enum(["available", "limited", "unavailable"]),
    trend: SatelliteObservationTrendSchema,
  })
  .strict();

export const SatelliteFrameRequestSchema = z
  .object({
    date: CalendarDateSchema,
    geometry: ParcelGeometrySchema,
    layer: SatelliteLayerSchema,
  })
  .strict();

export const SatelliteFrameResponseSchema = z
  .object({
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    imageBase64: z.string().min(1),
    layer: SatelliteLayerSchema,
    mediaType: z.literal("image/png"),
    observationDate: CalendarDateSchema,
    provenance: SatelliteProvenanceSchema,
  })
  .strict();

export type SatelliteFrameRequest = z.infer<typeof SatelliteFrameRequestSchema>;
export type SatelliteFrameResponse = z.infer<typeof SatelliteFrameResponseSchema>;
export type SatelliteCombinedObservation = z.infer<typeof SatelliteCombinedObservationSchema>;
export type SatelliteHistoryRequest = z.infer<typeof SatelliteHistoryRequestSchema>;
export type SatelliteHistoryResponse = z.infer<typeof SatelliteHistoryResponseSchema>;
export type SatelliteIndicator = z.infer<typeof SatelliteIndicatorSchema>;
export type SatelliteLayer = z.infer<typeof SatelliteLayerSchema>;
export type SatelliteObservation = z.infer<typeof SatelliteObservationSchema>;
export type SatelliteObservationSummaryRequest = z.infer<
  typeof SatelliteObservationSummaryRequestSchema
>;
export type SatelliteObservationSummaryResponse = z.infer<
  typeof SatelliteObservationSummaryResponseSchema
>;
export type SatelliteProvenance = z.infer<typeof SatelliteProvenanceSchema>;
export type SatelliteObservationTrend = z.infer<typeof SatelliteObservationTrendSchema>;
export type SatelliteQualityAssessment = z.infer<typeof SatelliteQualityAssessmentSchema>;
export type SatelliteVegetationHistoryPoint = z.infer<typeof SatelliteVegetationHistoryPointSchema>;
