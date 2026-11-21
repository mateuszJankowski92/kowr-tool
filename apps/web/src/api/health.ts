import { type HealthResponse, HealthResponseSchema } from "@kowr/contracts";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health", {
    headers: { Accept: "application/json" },
  });

  const payload: unknown = await response.json();
  return HealthResponseSchema.parse(payload);
}
