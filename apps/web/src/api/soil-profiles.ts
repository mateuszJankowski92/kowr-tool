import { type SoilProfileResponse, SoilProfileResponseSchema } from "@kowr/contracts";
import { requestJson } from "./request-json";

export function getSoilProfile(
  parcelIdentifier: string,
  signal?: AbortSignal,
): Promise<SoilProfileResponse> {
  const search = new URLSearchParams({ parcelIdentifier });
  return requestJson(`/api/soil-profiles?${search.toString()}`, SoilProfileResponseSchema, {
    signal,
  });
}
