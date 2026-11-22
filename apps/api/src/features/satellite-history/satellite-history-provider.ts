import type {
  ParcelGeometry,
  SatelliteCombinedObservation,
  SatelliteFrameResponse,
  SatelliteHistoryResponse,
  SatelliteIndicator,
  SatelliteLayer,
  SatelliteProvenance,
} from "@kowr/contracts";

export type SatelliteObservationSeries = {
  limitations: string[];
  observations: SatelliteCombinedObservation[];
  provenance: SatelliteProvenance;
  status: "complete" | "partial";
};

export type SatelliteHistoryProvider = {
  getFrame(
    geometry: ParcelGeometry,
    date: string,
    layer: SatelliteLayer,
    signal?: AbortSignal,
  ): Promise<SatelliteFrameResponse>;
  getHistory(
    geometry: ParcelGeometry,
    year: number,
    throughDate: string,
    indicator: SatelliteIndicator,
    signal?: AbortSignal,
  ): Promise<SatelliteHistoryResponse>;
  getObservationSeries(
    geometry: ParcelGeometry,
    fromDate: string,
    throughDate: string,
    signal?: AbortSignal,
  ): Promise<SatelliteObservationSeries>;
};

export type SatelliteHistoryProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "INVALID_RESPONSE"
  | "NOT_CONFIGURED"
  | "REQUEST_FAILED"
  | "TIMEOUT";

export class SatelliteHistoryProviderError extends Error {
  readonly code: SatelliteHistoryProviderErrorCode;

  constructor(code: SatelliteHistoryProviderErrorCode, cause?: unknown) {
    super("The satellite history provider request could not be completed.", { cause });
    this.name = "SatelliteHistoryProviderError";
    this.code = code;
  }
}
