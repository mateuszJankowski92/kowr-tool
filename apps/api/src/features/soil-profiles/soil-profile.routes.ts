import {
  ApiErrorResponseSchema,
  SoilProfileQuerySchema,
  SoilProfileResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import { getSoilProfile } from "./get-soil-profile.js";
import type { SoilProfileProvider } from "./soil-profile-provider.js";

export function createSoilProfileRoutes(
  parcelLocator: ParcelLocator,
  provider: SoilProfileProvider,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/soil-profiles",
      {
        schema: {
          tags: ["soil-profiles"],
          summary: "Get a modelled SoilGrids profile for a cadastral parcel",
          querystring: SoilProfileQuerySchema,
          response: {
            200: SoilProfileResponseSchema,
            400: ApiErrorResponseSchema,
            404: ApiErrorResponseSchema,
            422: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getSoilProfile(request.query.parcelIdentifier, parcelLocator, provider, request.raw.signal),
    );
  };
}
