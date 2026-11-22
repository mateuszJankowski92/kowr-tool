import { z } from "zod";
import { CropSchema } from "./crops.js";
import { ParcelGeometrySchema } from "./parcels.js";

export const CropDetectionRequestSchema = z
  .object({
    parcelIdentifier: z.string().trim().min(1).max(80),
    geometry: ParcelGeometrySchema,
  })
  .strict();

export const CropDetectionCandidateSchema = z
  .object({
    crop: CropSchema,
    label: z.string().min(1),
    overlapAreaSquareMeters: z.number().nonnegative(),
    overlapPercent: z.number().min(0).max(100),
  })
  .strict();

export const CropDetectionResponseSchema = z
  .object({
    status: z.enum(["suggested", "multiple", "not_found"]),
    candidates: z.array(CropDetectionCandidateSchema),
    complete: z.boolean(),
    provenance: z
      .object({
        provider: z.literal("ARiMR GSA"),
        dataset: z.literal("Deklaracje rolne 2025 - uprawy (GSA)"),
        campaign: z.literal(2025),
        retrievedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type CropDetectionRequest = z.infer<typeof CropDetectionRequestSchema>;
export type CropDetectionResponse = z.infer<typeof CropDetectionResponseSchema>;
