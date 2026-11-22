import {
  type Crop,
  type WaterAssessmentRequest,
  type WaterAssessmentResponse,
  WaterAssessmentResponseSchema,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

type WaterAssessmentInput = {
  analysisDate: string;
  crop: Crop;
  parcelIdentifier: string;
  seasonStartDate?: string;
};

export function createWaterAssessmentRequest(input: WaterAssessmentInput): WaterAssessmentRequest {
  return {
    parcel: { type: "identifier", identifier: input.parcelIdentifier },
    crop: input.crop,
    analysisDate: input.analysisDate,
    ...(input.seasonStartDate
      ? {
          phenology: {
            method: "fao56-reference" as const,
            seasonStartDates: [input.seasonStartDate],
            initialRootDepthMeters: 0.2,
          },
        }
      : {}),
    wettingTiming: "unknown",
    includeSatellite: true,
  };
}

export function getWaterAssessment(
  request: WaterAssessmentRequest,
  signal?: AbortSignal,
): Promise<WaterAssessmentResponse> {
  return requestJson("/api/analyses", WaterAssessmentResponseSchema, {
    method: "POST",
    body: request,
    signal,
  });
}
