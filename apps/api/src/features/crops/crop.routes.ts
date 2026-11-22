import { CropModelCapabilitiesResponseSchema } from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { listCropModelCapabilities } from "./list-crop-model-capabilities.js";

export function createCropRoutes(): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/crops",
      {
        schema: {
          tags: ["crops"],
          summary: "List crop model availability and reference quality for the full catalog",
          response: { 200: CropModelCapabilitiesResponseSchema },
        },
      },
      async () => listCropModelCapabilities(),
    );
  };
}
