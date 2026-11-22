import type { ParcelLocator } from "../../features/parcels/parcel-locator.js";
import { ParcelLocatorError } from "../../features/parcels/parcel-locator.js";

export function createGugikParcelLocator(
  primary: ParcelLocator,
  fallback: ParcelLocator,
): ParcelLocator {
  const withFallback = async <T>(
    primaryRequest: () => Promise<T>,
    fallbackRequest: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    try {
      return await primaryRequest();
    } catch (error) {
      if (!(error instanceof ParcelLocatorError)) throw error;
      if (signal?.aborted) throw signal.reason;
      return fallbackRequest();
    }
  };

  return {
    findByIdentifier(identifier, signal) {
      return withFallback(
        () => primary.findByIdentifier(identifier, signal),
        () => fallback.findByIdentifier(identifier, signal),
        signal,
      );
    },
    findByPoint(longitude, latitude, signal) {
      return withFallback(
        () => primary.findByPoint(longitude, latitude, signal),
        () => fallback.findByPoint(longitude, latitude, signal),
        signal,
      );
    },
  };
}
