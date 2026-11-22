import { z } from "zod";
import { CropSchema } from "./crops.js";

export const AnalysisDateSelectionSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("day"),
      date: z.iso.date(),
    }),
    z.strictObject({
      type: z.literal("range"),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
    }),
  ])
  .superRefine((selection, context) => {
    if (selection.type === "range" && selection.startDate > selection.endDate) {
      context.addIssue({
        code: "custom",
        message: "The analysis start date must not be later than the end date.",
        path: ["endDate"],
      });
    }
  });

export const AnalysisRequestSchema = z.strictObject({
  parcel: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("identifier"),
      identifier: z.string().trim().min(1),
    }),
    z.strictObject({
      type: z.literal("point"),
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
    }),
  ]),
  dateSelection: AnalysisDateSelectionSchema,
  crop: CropSchema,
});

export const AnalysisStatusSchema = z.enum(["complete", "partial", "failed"]);

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisDateSelection = z.infer<typeof AnalysisDateSelectionSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
