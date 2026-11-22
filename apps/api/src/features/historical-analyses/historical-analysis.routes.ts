import {
  ApiErrorResponseSchema,
  HistoricalWaterAssessmentRequestSchema,
  HistoricalWaterAssessmentResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  createHistoricalWaterAssessment,
  type HistoricalWaterAssessmentDependencies,
} from "./create-historical-water-assessment.js";

type RouteDependencies = Omit<HistoricalWaterAssessmentDependencies, "logger">;

export function createHistoricalAnalysisRoutes(
  dependencies: RouteDependencies,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/historical-analyses",
      {
        schema: {
          tags: ["historical-analyses"],
          summary: "Assess counterfactual crop water-stress susceptibility over ten prior seasons",
          body: HistoricalWaterAssessmentRequestSchema,
          response: {
            200: HistoricalWaterAssessmentResponseSchema,
            400: ApiErrorResponseSchema,
            404: ApiErrorResponseSchema,
            422: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        createHistoricalWaterAssessment(
          request.body,
          { ...dependencies, logger: app.log },
          request.raw.signal,
        ),
    );
  };
}
