import type { ParcelLookupQuery, ParcelResponse } from "@kowr/contracts";
import { ParcelNotFoundError, ParcelProviderUnavailableError } from "./parcel.errors.js";
import { type LocatedParcel, type ParcelLocator, ParcelLocatorError } from "./parcel-locator.js";

function toResponse(parcel: LocatedParcel): ParcelResponse {
  return {
    identifier: parcel.identifier,
    parcelNumber: parcel.parcelNumber,
    geometry: parcel.geometry,
    administrativeArea: parcel.administrativeArea,
    provenance: parcel.provenance,
  };
}

export async function findParcel(
  query: ParcelLookupQuery,
  locator: ParcelLocator,
  signal?: AbortSignal,
): Promise<ParcelResponse> {
  let parcel: LocatedParcel | null;

  try {
    parcel =
      "identifier" in query
        ? await locator.findByIdentifier(query.identifier, signal)
        : await locator.findByPoint(query.longitude, query.latitude, signal);
  } catch (error) {
    if (error instanceof ParcelLocatorError) {
      throw new ParcelProviderUnavailableError();
    }

    throw error;
  }

  if (!parcel) throw new ParcelNotFoundError();

  return toResponse(parcel);
}
