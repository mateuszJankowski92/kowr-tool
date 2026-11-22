import { z } from "zod";

const LongitudeSchema = z.number().min(-180).max(180);
const LatitudeSchema = z.number().min(-90).max(90);

export const SoilProfileQuerySchema = z
  .object({
    parcelIdentifier: z.string().trim().min(1).max(80),
  })
  .strict();

export const SoilPredictionSchema = z
  .object({
    q05: z.number().nullable(),
    q50: z.number().nullable(),
    q95: z.number().nullable(),
  })
  .strict()
  .superRefine((prediction, context) => {
    const { q05, q50, q95 } = prediction;
    if (q05 === null || q50 === null || q95 === null) return;

    if (q05 > q50 || q50 > q95) {
      context.addIssue({
        code: "custom",
        message: "Soil prediction quantiles must be ordered from Q0.05 to Q0.95.",
      });
    }
  });

const AvailableWaterCapacitySchema = z
  .object({
    volumetricPercent: z.number().nonnegative(),
    millimeters: z.number().nonnegative(),
  })
  .strict();

const AvailableWaterCapacityRangeSchema = z
  .object({
    using33Kpa: AvailableWaterCapacitySchema.nullable(),
    using10Kpa: AvailableWaterCapacitySchema.nullable(),
  })
  .strict()
  .superRefine((range, context) => {
    if (!range.using33Kpa || !range.using10Kpa) return;
    if (range.using33Kpa.volumetricPercent > range.using10Kpa.volumetricPercent) {
      context.addIssue({
        code: "custom",
        message: "The 33 kPa available-water variant must not exceed the 10 kPa variant.",
      });
    }
  });

function createSoilProfileLayerSchema(topDepthCm: number, bottomDepthCm: number) {
  return z
    .object({
      topDepthCm: z.literal(topDepthCm),
      bottomDepthCm: z.literal(bottomDepthCm),
      sandPercent: SoilPredictionSchema,
      siltPercent: SoilPredictionSchema,
      clayPercent: SoilPredictionSchema,
      soilOrganicCarbonGramsPerKilogram: SoilPredictionSchema,
      ph: SoilPredictionSchema,
      bulkDensityKilogramsPerCubicDecimeter: SoilPredictionSchema,
      waterContent10KpaPercent: SoilPredictionSchema,
      waterContent33KpaPercent: SoilPredictionSchema,
      waterContent1500KpaPercent: SoilPredictionSchema,
      availableWaterCapacity: AvailableWaterCapacityRangeSchema,
    })
    .strict();
}

const SoilProfileLayersSchema = z.tuple([
  createSoilProfileLayerSchema(0, 5),
  createSoilProfileLayerSchema(5, 15),
  createSoilProfileLayerSchema(15, 30),
  createSoilProfileLayerSchema(30, 60),
  createSoilProfileLayerSchema(60, 100),
  createSoilProfileLayerSchema(100, 200),
]);

export const SoilProfileStatusSchema = z.enum(["complete", "partial", "no-data"]);

export const SoilProfileLimitationSchema = z.enum([
  "single-representative-location",
  "modelled-not-field-measured",
  "nominal-250m-resolution",
  "not-current-soil-moisture",
  "not-date-specific",
  "field-capacity-method-range",
]);

const SoilProfileSampleSchema = z
  .object({
    location: z
      .object({
        type: z.literal("Point"),
        coordinates: z.tuple([LongitudeSchema, LatitudeSchema]),
      })
      .strict(),
    method: z.literal("representative-interior-point"),
    spatialSupport: z.literal("single-soilgrids-cell"),
  })
  .strict();

const SoilProfileProvenanceSchema = z
  .object({
    provider: z.literal("ISRIC"),
    dataset: z.literal("SoilGrids250m 2.0"),
    resolutionMeters: z.literal(250),
    predictionStatistic: z.literal("Q0.50"),
    uncertaintyInterval: z.literal("Q0.05-Q0.95"),
    license: z.literal("CC BY 4.0"),
    sourceUrl: z.url(),
    retrievedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const predictionFields = [
  "sandPercent",
  "siltPercent",
  "clayPercent",
  "soilOrganicCarbonGramsPerKilogram",
  "ph",
  "bulkDensityKilogramsPerCubicDecimeter",
  "waterContent10KpaPercent",
  "waterContent33KpaPercent",
  "waterContent1500KpaPercent",
] as const;

export const SoilProfileResponseSchema = z
  .object({
    status: SoilProfileStatusSchema,
    sample: SoilProfileSampleSchema,
    layers: SoilProfileLayersSchema,
    provenance: SoilProfileProvenanceSchema,
    limitations: z.array(SoilProfileLimitationSchema).min(1),
  })
  .strict()
  .superRefine((profile, context) => {
    const values = profile.layers.flatMap((layer) =>
      predictionFields
        .flatMap((field) => {
          const prediction = layer[field];
          return [prediction.q05, prediction.q50, prediction.q95];
        })
        .concat(
          layer.availableWaterCapacity.using33Kpa?.volumetricPercent ?? null,
          layer.availableWaterCapacity.using33Kpa?.millimeters ?? null,
          layer.availableWaterCapacity.using10Kpa?.volumetricPercent ?? null,
          layer.availableWaterCapacity.using10Kpa?.millimeters ?? null,
        ),
    );
    const hasAnyValue = values.some((value) => value !== null);
    const hasMissingValue = values.some((value) => value === null);

    if (profile.status === "complete" && hasMissingValue) {
      context.addIssue({
        code: "custom",
        message: "A complete soil profile must contain every prediction value.",
        path: ["status"],
      });
    }

    if (profile.status === "no-data" && hasAnyValue) {
      context.addIssue({
        code: "custom",
        message: "A no-data soil profile must not contain prediction values.",
        path: ["status"],
      });
    }

    if (profile.status === "partial" && (!hasAnyValue || !hasMissingValue)) {
      context.addIssue({
        code: "custom",
        message: "A partial soil profile must contain both values and missing values.",
        path: ["status"],
      });
    }
  });

export type SoilProfileQuery = z.infer<typeof SoilProfileQuerySchema>;
export type SoilPrediction = z.infer<typeof SoilPredictionSchema>;
export type SoilProfileStatus = z.infer<typeof SoilProfileStatusSchema>;
export type SoilProfileLimitation = z.infer<typeof SoilProfileLimitationSchema>;
export type SoilProfileResponse = z.infer<typeof SoilProfileResponseSchema>;
