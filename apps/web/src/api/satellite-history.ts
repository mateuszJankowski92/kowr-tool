import {
  type SatelliteFrameRequest,
  type SatelliteFrameResponse,
  SatelliteFrameResponseSchema,
  type SatelliteHistoryRequest,
  type SatelliteHistoryResponse,
  SatelliteHistoryResponseSchema,
  type SatelliteObservationSummaryRequest,
  type SatelliteObservationSummaryResponse,
  SatelliteObservationSummaryResponseSchema,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

export function getSatelliteHistory(
  request: SatelliteHistoryRequest,
  signal?: AbortSignal,
): Promise<SatelliteHistoryResponse> {
  return requestJson("/api/satellite-history", SatelliteHistoryResponseSchema, {
    body: request,
    method: "POST",
    signal,
  });
}

export function getSatelliteFrame(
  request: SatelliteFrameRequest,
  signal?: AbortSignal,
): Promise<SatelliteFrameResponse> {
  return requestJson("/api/satellite-history/frame", SatelliteFrameResponseSchema, {
    body: request,
    method: "POST",
    signal,
  });
}

export function getSatelliteObservationSummary(
  request: SatelliteObservationSummaryRequest,
  signal?: AbortSignal,
): Promise<SatelliteObservationSummaryResponse> {
  return requestJson(
    "/api/satellite-observations/summary",
    SatelliteObservationSummaryResponseSchema,
    {
      body: request,
      method: "POST",
      signal,
    },
  );
}
