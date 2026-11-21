import { type HealthResponse, HealthResponseSchema } from "@kowr/contracts";
import { requestJson } from "./request-json";

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson("/api/health", HealthResponseSchema);
}
