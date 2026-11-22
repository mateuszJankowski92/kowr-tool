import {
  type CropDetectionResponse,
  CropDetectionResponseSchema,
  type ParcelResponse,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

export function getCropDetection(
  parcel: Pick<ParcelResponse, "geometry" | "identifier">,
  signal?: AbortSignal,
): Promise<CropDetectionResponse> {
  return requestJson("/api/crop-detections", CropDetectionResponseSchema, {
    method: "POST",
    body: {
      parcelIdentifier: parcel.identifier,
      geometry: parcel.geometry,
    },
    signal,
  });
}
