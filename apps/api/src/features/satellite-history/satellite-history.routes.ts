import {
  ApiErrorResponseSchema,
  SatelliteFrameRequestSchema,
  SatelliteFrameResponseSchema,
  SatelliteHistoryRequestSchema,
  SatelliteHistoryResponseSchema,
  SatelliteObservationSummaryRequestSchema,
  SatelliteObservationSummaryResponseSchema,
} from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getSatelliteFrame } from "./get-satellite-frame.js";
import { getSatelliteHistory } from "./get-satellite-history.js";
import { getSatelliteObservationSummary } from "./get-satellite-observation-summary.js";
import type { SatelliteHistoryProvider } from "./satellite-history-provider.js";

export function createSatelliteHistoryRoutes(
  provider: SatelliteHistoryProvider,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/satellite-observations/summary",
      {
        schema: {
          tags: ["satellite-observations"],
          summary: "Summarize useful Sentinel-2 observations before an analysis date",
          body: SatelliteObservationSummaryRequestSchema,
          response: {
            200: SatelliteObservationSummaryResponseSchema,
            400: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getSatelliteObservationSummary(
          request.body.geometry,
          request.body.analysisDate,
          provider,
          request.raw.signal,
        ),
    );

    app.post(
      "/satellite-history",
      {
        schema: {
          tags: ["satellite-history"],
          summary: "List Sentinel-2 observations and parcel statistics for a year",
          body: SatelliteHistoryRequestSchema,
          response: {
            200: SatelliteHistoryResponseSchema,
            400: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getSatelliteHistory(
          request.body.geometry,
          request.body.year,
          request.body.throughDate,
          request.body.indicator,
          provider,
          request.raw.signal,
        ),
    );

    app.post(
      "/satellite-history/frame",
      {
        schema: {
          tags: ["satellite-history"],
          summary: "Render a Sentinel-2 parcel image for an observation date",
          body: SatelliteFrameRequestSchema,
          response: {
            200: SatelliteFrameResponseSchema,
            400: ApiErrorResponseSchema,
            500: ApiErrorResponseSchema,
            503: ApiErrorResponseSchema,
          },
        },
      },
      async (request) =>
        getSatelliteFrame(
          request.body.geometry,
          request.body.date,
          request.body.layer,
          provider,
          request.raw.signal,
        ),
    );
  };
}
