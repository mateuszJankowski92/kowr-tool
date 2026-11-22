import { z } from "zod";
import { ParcelGeometrySchema } from "./parcels.js";

export const TerrainContextQuerySchema = z
  .object({
    parcelIdentifier: z.string().trim().min(1).max(80),
  })
  .strict();

const ProjectedPositionSchema = z.tuple([z.number(), z.number()]);
const ProjectedRingSchema = z.array(ProjectedPositionSchema).min(4);
const ProjectedPolygonSchema = z.array(ProjectedRingSchema).min(1);

export const ProjectedParcelGeometrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("Polygon"),
      coordinates: ProjectedPolygonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(ProjectedPolygonSchema).min(1),
    })
    .strict(),
]);

export const TerrainBoundsSchema = z
  .object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  })
  .strict()
  .refine((bounds) => bounds.west < bounds.east && bounds.south < bounds.north, {
    message: "Terrain bounds must have a positive width and height.",
  });

const TerrainGridSchema = z
  .object({
    columns: z.number().int().min(2).max(128),
    rows: z.number().int().min(2).max(128),
    bounds: TerrainBoundsSchema,
    cellSizeMeters: z.number().positive(),
    heightsMeters: z.array(z.number().nullable()).min(4).max(16_384),
  })
  .strict()
  .superRefine((grid, context) => {
    if (grid.heightsMeters.length !== grid.columns * grid.rows) {
      context.addIssue({
        code: "custom",
        message: "Terrain height count must match the declared grid dimensions.",
        path: ["heightsMeters"],
      });
    }
  });

const TerrainMetricsSchema = z
  .object({
    minimumElevationMeters: z.number(),
    maximumElevationMeters: z.number(),
    elevationRangeMeters: z.number().nonnegative(),
    typicalSlopeDegrees: z.number().nonnegative().nullable(),
    steepSlopeP90Degrees: z.number().nonnegative().nullable(),
    dominantAspect: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).nullable(),
    sampledCellCount: z.number().int().positive(),
    slopeSampleCount: z.number().int().nonnegative(),
  })
  .strict();

const TerrainSourceSchema = z
  .object({
    provider: z.literal("GUGiK"),
    dataset: z.literal("Numeryczny Model Terenu"),
    horizontalCrs: z.literal("EPSG:2180"),
    verticalReference: z.literal("PL-EVRF2007-NH"),
    sourceDataDate: z.iso.date().nullable(),
    retrievedAt: z.iso.datetime({ offset: true }),
    usageTerms: z.literal("Free use under the Polish Geodetic and Cartographic Law"),
  })
  .strict();

const UnavailableContextSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum(["provider-error", "no-data"]),
    message: z.string().min(1),
  })
  .strict();

const TerrainAvailableSchema = z
  .object({
    status: z.literal("available"),
    metrics: TerrainMetricsSchema,
    grid: TerrainGridSchema,
    parcelGeometry: ProjectedParcelGeometrySchema,
    verticalScale: z.literal(1),
    source: TerrainSourceSchema,
    limitations: z.array(z.string().min(1)),
    inspectionPoints: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          kind: z.enum(["low-terrain-cell", "slope-cell"]),
          coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
          elevationMeters: z.number(),
          cellSizeMeters: z.number().positive(),
        }),
      )
      .max(2)
      .optional(),
  })
  .strict();

const SurroundingsSourceSchema = z
  .object({
    provider: z.literal("OpenStreetMap contributors"),
    dataset: z.literal("OpenStreetMap via Overpass API"),
    horizontalCrs: z.literal("EPSG:4326 projected to EPSG:2180"),
    snapshotAt: z.iso.datetime({ offset: true }),
    retrievedAt: z.iso.datetime({ offset: true }),
    usageTerms: z.literal("Open Database License 1.0 (ODbL)"),
    sourceUrl: z.url(),
  })
  .strict();

export const HydrologyKindSchema = z.enum([
  "river",
  "stream",
  "canal",
  "ditch",
  "drain",
  "lake",
  "pond",
  "reservoir",
  "wetland",
  "other-water",
]);

export const LandUseKindSchema = z.enum([
  "agriculture",
  "forest",
  "grassland",
  "wetland",
  "water",
  "built-up",
  "other",
]);

const GeographicPositionSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
export const HydrologyGeometrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("LineString"),
      coordinates: z.array(GeographicPositionSchema).min(2),
    })
    .strict(),
  ParcelGeometrySchema.options[0],
]);

const HydrologyAvailableSchema = z
  .object({
    status: z.literal("available"),
    searchRadiusMeters: z.number().positive(),
    objectCount: z.number().int().nonnegative(),
    nearestDistanceMeters: z.number().nonnegative().nullable(),
    intersectsParcel: z.boolean(),
    objects: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: HydrologyKindSchema,
            name: z.string().min(1).nullable(),
            geometry: HydrologyGeometrySchema,
            distanceMeters: z.number().nonnegative(),
            relation: z.enum(["intersects-parcel", "adjacent", "nearby"]),
          })
          .strict(),
      )
      .max(20),
    source: SurroundingsSourceSchema,
    limitations: z.array(z.string().min(1)),
  })
  .strict();

const LandUseAvailableSchema = z
  .object({
    status: z.literal("available"),
    coveragePercent: z.number().min(0).max(100),
    dominantClass: LandUseKindSchema.nullable(),
    sampledPointCount: z.number().int().nonnegative(),
    classifiedPointCount: z.number().int().nonnegative(),
    sampleSpacingMeters: z.number().positive().nullable(),
    classes: z
      .array(
        z
          .object({
            kind: LandUseKindSchema,
            areaPercent: z.number().min(0).max(100),
            sampledPointCount: z.number().int().positive(),
          })
          .strict(),
      )
      .max(7),
    source: SurroundingsSourceSchema,
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export const TerrainContextResponseSchema = z
  .object({
    status: z.enum(["complete", "partial", "unavailable"]),
    parcelIdentifier: z.string().min(1),
    terrain: z.discriminatedUnion("status", [TerrainAvailableSchema, UnavailableContextSchema]),
    surroundings: z
      .object({
        hydrology: z.discriminatedUnion("status", [
          HydrologyAvailableSchema,
          UnavailableContextSchema,
        ]),
        landUse: z.discriminatedUnion("status", [LandUseAvailableSchema, UnavailableContextSchema]),
      })
      .strict(),
  })
  .strict();

export const TerrainTextureResponseSchema = z
  .object({
    imageDataUrl: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
    bounds: TerrainBoundsSchema,
    source: z
      .object({
        provider: z.literal("GUGiK"),
        dataset: z.literal("Ortofotomapa standardowa"),
        horizontalCrs: z.literal("EPSG:2180"),
        sourceDataDate: z.iso.date().nullable(),
        retrievedAt: z.iso.datetime({ offset: true }),
        usageTerms: z.literal("Free use under the Polish Geodetic and Cartographic Law"),
      })
      .strict(),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export type TerrainContextQuery = z.infer<typeof TerrainContextQuerySchema>;
export type TerrainBounds = z.infer<typeof TerrainBoundsSchema>;
export type ProjectedParcelGeometry = z.infer<typeof ProjectedParcelGeometrySchema>;
export type TerrainContextResponse = z.infer<typeof TerrainContextResponseSchema>;
export type HydrologyKind = z.infer<typeof HydrologyKindSchema>;
export type LandUseKind = z.infer<typeof LandUseKindSchema>;
export type TerrainTextureResponse = z.infer<typeof TerrainTextureResponseSchema>;
