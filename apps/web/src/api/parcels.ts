import { type ParcelResponse, ParcelResponseSchema } from "@kowr/contracts";
import { requestJson } from "./request-json";

export type ParcelLookup =
  | { type: "identifier"; identifier: string }
  | { type: "point"; longitude: number; latitude: number };

export function getParcel(lookup: ParcelLookup, signal?: AbortSignal): Promise<ParcelResponse> {
  const search = new URLSearchParams();

  if (lookup.type === "identifier") {
    search.set("identifier", lookup.identifier);
  } else {
    search.set("longitude", String(lookup.longitude));
    search.set("latitude", String(lookup.latitude));
  }

  return requestJson(`/api/parcels?${search.toString()}`, ParcelResponseSchema, { signal });
}
