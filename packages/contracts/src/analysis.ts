import { z } from "zod";

export const CropSchema = z.enum(["wheat", "maize", "potato", "rapeseed"]);

export const AnalysisRequestSchema = z.object({
  parcel: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("identifier"),
      identifier: z.string().trim().min(1),
    }),
    z.object({
      type: z.literal("point"),
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
    }),
  ]),
  analysisDate: z.iso.date(),
  crop: CropSchema,
});

export const AnalysisStatusSchema = z.enum(["complete", "partial", "failed"]);

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
