import {
  type Crop,
  type HistoricalWaterAssessmentRequest,
  type HistoricalWaterAssessmentResponse,
  HistoricalWaterAssessmentResponseSchema,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

type HistoricalWaterAssessmentInput = {
  analysisDate: string;
  crop: Crop;
  parcelIdentifier: string;
  seasonStartDate?: string;
};

export function createHistoricalWaterAssessmentRequest(
  input: HistoricalWaterAssessmentInput,
): HistoricalWaterAssessmentRequest {
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
  };
}

export function getHistoricalWaterAssessment(
  request: HistoricalWaterAssessmentRequest,
  signal?: AbortSignal,
): Promise<HistoricalWaterAssessmentResponse> {
  return requestJson("/api/historical-analyses", HistoricalWaterAssessmentResponseSchema, {
    method: "POST",
    body: request,
    signal,
  });
}
