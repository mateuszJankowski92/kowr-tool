import { z } from "zod";
import { CropSchema } from "./crops.js";
import { HydrologyGeometrySchema, TerrainContextResponseSchema } from "./terrain-context.js";

const TerrainAvailableSchema = TerrainContextResponseSchema.shape.terrain.options[0];
const HydrologyAvailableSchema =
  TerrainContextResponseSchema.shape.surroundings.shape.hydrology.options[0];
const CropPracticeSchema = z.enum([
  "annual-standing",
  "annual-post-season",
  "perennial-interrows",
  "perennial-sward",
  "unknown",
]);
const RecommendationLocationSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["water-object", "low-terrain-cell", "slope-cell"]),
  name: z.string().nullable(),
  geometry: z.union([
    HydrologyGeometrySchema,
    z.strictObject({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    }),
  ]),
  source: z.enum(["GUGiK NMT", "OpenStreetMap"]),
  resolutionMeters: z.number().positive().nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
});

export const RecommendationContextRequestSchema = z.strictObject({
  crop: CropSchema,
  cropPeriod: z.enum(["active-season", "completed-season", "unknown"]),
  water: z.strictObject({
    status: z.enum(["complete", "indeterminate", "insufficient-data"]),
    classification: z
      .enum([
        "no-significant-shortage-indications",
        "elevated-shortage-risk",
        "strong-shortage-indications",
        "indeterminate",
        "insufficient-data",
      ])
      .nullable(),
    maximumStressDays: z.number().nonnegative().nullable(),
    maximumEvapotranspirationDeficitMm: z.number().nonnegative().nullable(),
  }),
  soil: z.strictObject({
    status: z.enum(["complete", "partial", "no-data", "unavailable"]),
    topsoilOrganicCarbonGramsPerKilogram: z.number().nonnegative().nullable(),
    availableWaterCapacityMillimeters: z.number().nonnegative().nullable(),
  }),
  terrain: z.strictObject({
    status: z.enum(["available", "unavailable"]),
    typicalSlopeDegrees: z.number().nonnegative().nullable(),
    elevationRangeMeters: z.number().nonnegative().nullable(),
    inspectionPoints: TerrainAvailableSchema.shape.inspectionPoints,
  }),
  hydrology: z.strictObject({
    status: z.enum(["available", "unavailable"]),
    intersectsParcel: z.boolean().nullable(),
    nearestDistanceMeters: z.number().nonnegative().nullable(),
    objects: HydrologyAvailableSchema.shape.objects.optional(),
  }),
  landUse: z.strictObject({
    status: z.enum(["available", "unavailable"]),
    dominantClass: z.string().min(1).nullable(),
    coveragePercent: z.number().min(0).max(100).nullable(),
  }),
  satellite: z.strictObject({
    consistency: z.enum([
      "consistent-with-balance",
      "conflicts-with-balance",
      "neutral",
      "unavailable",
      "not-qualified",
      "not-comparable",
    ]),
  }),
});

const RecommendationEvidenceSchema = z.strictObject({
  code: z.enum([
    "modelled-water-stress",
    "no-modelled-water-stress",
    "scenario-disagreement",
    "agricultural-land-use",
    "terrain-relief",
    "nearby-water-object",
    "water-object-on-parcel",
    "modelled-soil-profile",
    "satellite-conflict",
    "incomplete-inputs",
    "crop-root-depth",
  ]),
  value: z.number().nullable(),
  unit: z.enum(["days", "millimeters", "degrees", "meters", "percent"]).nullable(),
});

export const RecommendationResponseSchema = z.strictObject({
  status: z.enum(["complete", "partial", "unavailable"]),
  items: z
    .array(
      z.strictObject({
        id: z.enum([
          "protect-soil-surface",
          "manage-perennial-cover",
          "build-soil-organic-matter",
          "review-contour-practices",
          "inspect-nearby-water-network",
          "survey-distributed-retention",
          "verify-field-conditions",
          "maintain-water-conservation-practices",
        ]),
        cropPractice: CropPracticeSchema,
        locations: z.array(RecommendationLocationSchema).max(3),
        category: z.enum(["retention", "agronomic"]),
        priority: z.enum(["high", "medium", "low"]),
        evidence: z.array(RecommendationEvidenceSchema).min(1),
        missingInputs: z.array(
          z.enum([
            "current-field-soil-moisture",
            "confirmed-crop-growth-stage",
            "field-management-history",
            "detailed-runoff-survey",
            "drainage-ownership-and-condition",
            "legal-and-environmental-constraints",
          ]),
        ),
        verification: z.array(
          z.enum([
            "field-inspection",
            "agronomist-review",
            "survey-and-design",
            "formal-and-legal-check",
          ]),
        ),
      }),
    )
    .max(4),
});

export type RecommendationContextRequest = z.infer<typeof RecommendationContextRequestSchema>;
export type RecommendationResponse = z.infer<typeof RecommendationResponseSchema>;
export type RecommendationItem = RecommendationResponse["items"][number];
