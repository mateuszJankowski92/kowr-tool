import {
  ApiErrorResponseSchema,
  CropDetectionRequestSchema,
  CropDetectionResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { CropDetector } from "./crop-detector.js";
import { detectCrops } from "./detect-crops.js";

export function createCropDetectionRoutes(detector: CropDetector): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/crop-detections",
      {
        schema: {
          tags: ["crops"],
          summary: "Suggest crops from ARiMR GSA declarations intersecting a parcel",
          body: CropDetectionRequestSchema,
          response: {
            200: CropDetectionResponseSchema,
            400: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) => detectCrops(request.body, detector),
    );
  };
}
