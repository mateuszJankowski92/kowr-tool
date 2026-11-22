import {
  ApiErrorResponseSchema,
  TerrainContextQuerySchema,
  TerrainContextResponseSchema,
  TerrainTextureResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import { getTerrainContext } from "./get-terrain-context.js";
import { getTerrainTexture } from "./get-terrain-texture.js";
import type { SurroundingsProvider } from "./surroundings-provider.js";
import type { TerrainProvider, TerrainTextureProvider } from "./terrain-provider.js";

export function createTerrainContextRoutes(
  parcelLocator: ParcelLocator,
  terrainProvider: TerrainProvider,
  textureProvider: TerrainTextureProvider,
  surroundingsProvider: SurroundingsProvider,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/terrain-contexts",
      {
        schema: {
          tags: ["terrain"],
          summary: "Analyse parcel terrain, hydrology, and land use",
          querystring: TerrainContextQuerySchema,
          response: {
            200: TerrainContextResponseSchema,
            400: ApiErrorResponseSchema,
            404: ApiErrorResponseSchema,
            422: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getTerrainContext(
          request.query.parcelIdentifier,
          parcelLocator,
          terrainProvider,
          surroundingsProvider,
          request.raw.signal,
        ),
    );

    app.get(
      "/terrain-textures",
      {
        schema: {
          tags: ["terrain"],
          summary: "Get a georeferenced GUGiK orthophoto texture for parcel terrain",
          querystring: TerrainContextQuerySchema,
          response: {
            200: TerrainTextureResponseSchema,
            400: ApiErrorResponseSchema,
            404: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getTerrainTexture(
          request.query.parcelIdentifier,
          parcelLocator,
          textureProvider,
          request.raw.signal,
        ),
    );
  };
}
