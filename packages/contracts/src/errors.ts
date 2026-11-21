import { z } from "zod";

export const ApiErrorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
