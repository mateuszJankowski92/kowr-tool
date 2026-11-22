import { AppError } from "../../errors/app-error.js";

export class SatelliteHistoryProviderUnavailableError extends AppError {
  constructor() {
    super({
      code: "SATELLITE_PROVIDER_UNAVAILABLE",
      message: "Satellite observations are temporarily unavailable. Please try again.",
      statusCode: 503,
    });
  }
}

export class SatelliteHistoryNotConfiguredError extends AppError {
  constructor() {
    super({
      code: "SATELLITE_PROVIDER_NOT_CONFIGURED",
      message: "Satellite imagery requires CDSE API credentials on the server.",
      statusCode: 503,
    });
  }
}

export class SatelliteHistoryAuthenticationError extends AppError {
  constructor() {
    super({
      code: "SATELLITE_PROVIDER_AUTHENTICATION_FAILED",
      message: "The satellite imagery service rejected the server credentials.",
      statusCode: 503,
    });
  }
}
