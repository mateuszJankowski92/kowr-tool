import type { LocatedParcel, ParcelLocator } from "./parcel-locator.js";

const PARCEL_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHED_PARCELS = 512;

export function createCachedParcelLocator(
  locator: ParcelLocator,
  clock: () => Date,
): ParcelLocator {
  const parcels = new Map<string, { parcel: LocatedParcel; expiresAt: number }>();
  const remember = (parcel: LocatedParcel | null) => {
    if (parcel) {
      parcels.set(parcel.identifier, {
        parcel: structuredClone(parcel),
        expiresAt: clock().getTime() + PARCEL_CACHE_TTL_MS,
      });
      if (parcels.size > MAX_CACHED_PARCELS) {
        const oldest = parcels.keys().next().value;
        if (oldest !== undefined) parcels.delete(oldest);
      }
    }
    return parcel;
  };

  return {
    async findByIdentifier(identifier, signal) {
      signal?.throwIfAborted();
      const cached = parcels.get(identifier);
      if (cached && cached.expiresAt > clock().getTime()) return structuredClone(cached.parcel);
      parcels.delete(identifier);
      return remember(await locator.findByIdentifier(identifier, signal));
    },
    async findByPoint(longitude, latitude, signal) {
      signal?.throwIfAborted();
      return remember(await locator.findByPoint(longitude, latitude, signal));
    },
  };
}
