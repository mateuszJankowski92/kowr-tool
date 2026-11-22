import {
  ApiErrorResponseSchema,
  WeatherConditionsRequestSchema,
  WeatherConditionsResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getWeatherConditions } from "./get-weather-conditions.js";
import type { WeatherConditionsProvider } from "./weather-conditions-provider.js";

export function createWeatherConditionsRoutes(
  primaryProvider: WeatherConditionsProvider,
  fallbackProvider: WeatherConditionsProvider,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/weather-conditions",
      {
        schema: {
          tags: ["weather-conditions"],
          summary: "Calculate precipitation and reference evapotranspiration for a parcel",
          body: WeatherConditionsRequestSchema,
          response: {
            200: WeatherConditionsResponseSchema,
            400: ApiErrorResponseSchema,
            422: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getWeatherConditions(request.body, primaryProvider, fallbackProvider, request.raw.signal),
    );
  };
}
