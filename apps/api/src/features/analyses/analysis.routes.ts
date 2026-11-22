import {
  ApiErrorResponseSchema,
  WaterAssessmentRequestSchema,
  WaterAssessmentResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  createWaterAssessment,
  type WaterAssessmentDependencies,
} from "./create-water-assessment.js";

export function createAnalysisRoutes(
  dependencies: WaterAssessmentDependencies,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/analyses",
      {
        schema: {
          tags: ["analyses"],
          summary: "Assess the modelled root-zone water situation for a parcel and crop",
          body: WaterAssessmentRequestSchema,
          response: {
            200: WaterAssessmentResponseSchema,
            400: ApiErrorResponseSchema,
            404: ApiErrorResponseSchema,
            422: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) => createWaterAssessment(request.body, dependencies, request.raw.signal),
    );
  };
}
