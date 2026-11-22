import {
  type CropModelCapabilitiesResponse,
  CropModelCapabilitiesResponseSchema,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

export function getCropModelCapabilities(
  signal?: AbortSignal,
): Promise<CropModelCapabilitiesResponse> {
  return requestJson("/api/crops", CropModelCapabilitiesResponseSchema, { signal });
}
