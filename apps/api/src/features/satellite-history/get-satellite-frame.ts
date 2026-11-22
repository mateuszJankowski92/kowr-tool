import type { ParcelGeometry, SatelliteFrameResponse, SatelliteLayer } from "@kowr/contracts";
import {
  SatelliteHistoryAuthenticationError,
  SatelliteHistoryNotConfiguredError,
  SatelliteHistoryProviderUnavailableError,
} from "./satellite-history.errors.js";
import {
  type SatelliteHistoryProvider,
  SatelliteHistoryProviderError,
} from "./satellite-history-provider.js";

export async function getSatelliteFrame(
  geometry: ParcelGeometry,
  date: string,
  layer: SatelliteLayer,
  provider: SatelliteHistoryProvider,
  signal?: AbortSignal,
): Promise<SatelliteFrameResponse> {
  try {
    return await provider.getFrame(geometry, date, layer, signal);
  } catch (error) {
    if (error instanceof SatelliteHistoryProviderError) {
      if (error.code === "NOT_CONFIGURED") throw new SatelliteHistoryNotConfiguredError();
      if (error.code === "AUTHENTICATION_FAILED") {
        throw new SatelliteHistoryAuthenticationError();
      }
    }

    throw new SatelliteHistoryProviderUnavailableError();
  }
}
