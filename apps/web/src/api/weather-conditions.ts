import {
  type WeatherConditionsRequest,
  type WeatherConditionsResponse,
  WeatherConditionsResponseSchema,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

export function getWeatherConditions(
  request: WeatherConditionsRequest,
  signal?: AbortSignal,
): Promise<WeatherConditionsResponse> {
  return requestJson("/api/weather-conditions", WeatherConditionsResponseSchema, {
    method: "POST",
    body: request,
    signal,
  });
}
