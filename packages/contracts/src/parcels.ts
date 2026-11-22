import { z } from "zod";

const LongitudeSchema = z.number().min(-180).max(180);
const LatitudeSchema = z.number().min(-90).max(90);
const PositionSchema = z.tuple([LongitudeSchema, LatitudeSchema]);
const LinearRingSchema = z.array(PositionSchema).min(4);
const PolygonCoordinatesSchema = z.array(LinearRingSchema).min(1);
const CoordinateQuerySchema = z
  .string()
  .trim()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/);

export const ParcelLookupQuerySchema = z.union([
  z
    .object({
      identifier: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      longitude: CoordinateQuerySchema.pipe(z.coerce.number<string>().min(-180).max(180)),
      latitude: CoordinateQuerySchema.pipe(z.coerce.number<string>().min(-90).max(90)),
    })
    .strict(),
]);

export const ParcelGeometrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("Polygon"),
      coordinates: PolygonCoordinatesSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(PolygonCoordinatesSchema).min(1),
    })
    .strict(),
]);

export const ParcelResponseSchema = z
  .object({
    identifier: z.string().min(1),
    parcelNumber: z.string().min(1),
    geometry: ParcelGeometrySchema,
    administrativeArea: z
      .object({
        voivodeship: z.string().min(1).nullable(),
        county: z.string().min(1).nullable(),
        commune: z.string().min(1).nullable(),
        cadastralDistrict: z.string().min(1).nullable(),
      })
      .strict(),
    provenance: z
      .object({
        provider: z.enum(["GUGiK ULDK", "GUGiK EGiB WFS"]),
        datasource: z.string().min(1).nullable(),
        retrievedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type ParcelLookupQuery = z.infer<typeof ParcelLookupQuerySchema>;
export type ParcelGeometry = z.infer<typeof ParcelGeometrySchema>;
export type ParcelResponse = z.infer<typeof ParcelResponseSchema>;
