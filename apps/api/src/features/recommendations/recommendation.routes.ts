import {
  ApiErrorResponseSchema,
  RecommendationContextRequestSchema,
  RecommendationResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createRecommendations } from "./create-recommendations.js";

export function createRecommendationRoutes(): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/recommendations",
      {
        schema: {
          tags: ["recommendations"],
          summary: "Generate evidence-linked parcel recommendations from analysed context",
          body: RecommendationContextRequestSchema,
          response: {
            200: RecommendationResponseSchema,
            400: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
          },
        },
      },
      async (request) => createRecommendations(request.body),
    );
  };
}
