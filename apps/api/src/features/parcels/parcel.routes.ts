import {
  ApiErrorResponseSchema,
  ParcelLookupQuerySchema,
  ParcelResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { findParcel } from "./find-parcel.js";
import type { ParcelLocator } from "./parcel-locator.js";

export function createParcelRoutes(locator: ParcelLocator): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/parcels",
      {
        schema: {
          tags: ["parcels"],
          summary: "Locate a cadastral parcel by identifier or point",
          querystring: ParcelLookupQuerySchema,
          response: {
            200: ParcelResponseSchema,
            400: ApiErrorResponseSchema,
            404: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) => findParcel(request.query, locator),
    );
  };
}
