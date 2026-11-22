import { z } from "zod";
import { CROP_CATALOG, CropSchema } from "./crops.js";

export const CropModelKindSchema = z.enum(["species-reference", "approximate", "environment-only"]);

export const CropModelCapabilitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    crop: CropSchema,
    kind: z.literal("species-reference"),
    profileId: z.string().min(1),
  }),
  z.strictObject({
    crop: CropSchema,
    kind: z.literal("approximate"),
    profileId: z.string().min(1),
  }),
  z.strictObject({
    crop: CropSchema,
    kind: z.literal("environment-only"),
    profileId: z.null(),
  }),
]);

// A complete, unique catalog prevents missing metadata from looking like lack of support.
export const CropModelCapabilitiesResponseSchema = z
  .array(CropModelCapabilitySchema)
  .length(CROP_CATALOG.length)
  .refine((entries) => new Set(entries.map(({ crop }) => crop)).size === entries.length, {
    message: "Each catalog crop must appear exactly once.",
  });

export type CropModelCapability = z.infer<typeof CropModelCapabilitySchema>;
export type CropModelCapabilitiesResponse = z.infer<typeof CropModelCapabilitiesResponseSchema>;
