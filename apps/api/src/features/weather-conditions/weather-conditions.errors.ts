import { AppError } from "../../errors/app-error.js";

export class WeatherConditionsUnavailableError extends AppError {
  constructor() {
    super({
      code: "WEATHER_CONDITIONS_UNAVAILABLE",
      message: "Weather data is temporarily unavailable. Please try again.",
      statusCode: 503,
    });
  }
}

export class WeatherConditionsLocationUnavailableError extends AppError {
  constructor() {
    super({
      code: "WEATHER_LOCATION_UNAVAILABLE",
      message: "A representative weather location could not be derived from the parcel.",
      statusCode: 422,
    });
  }
}
