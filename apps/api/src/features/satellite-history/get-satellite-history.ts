import type { ParcelGeometry, SatelliteHistoryResponse, SatelliteIndicator } from "@kowr/contracts";
import {
  SatelliteHistoryAuthenticationError,
  SatelliteHistoryNotConfiguredError,
  SatelliteHistoryProviderUnavailableError,
} from "./satellite-history.errors.js";
import {
  type SatelliteHistoryProvider,
  SatelliteHistoryProviderError,
} from "./satellite-history-provider.js";

function mapProviderError(error: unknown): never {
  if (error instanceof SatelliteHistoryProviderError) {
    if (error.code === "NOT_CONFIGURED") throw new SatelliteHistoryNotConfiguredError();
    if (error.code === "AUTHENTICATION_FAILED") {
      throw new SatelliteHistoryAuthenticationError();
    }
  }

  throw new SatelliteHistoryProviderUnavailableError();
}

export async function getSatelliteHistory(
  geometry: ParcelGeometry,
  year: number,
  throughDate: string,
  indicator: SatelliteIndicator,
  provider: SatelliteHistoryProvider,
  signal?: AbortSignal,
): Promise<SatelliteHistoryResponse> {
  try {
    return await provider.getHistory(geometry, year, throughDate, indicator, signal);
  } catch (error) {
    return mapProviderError(error);
  }
}
