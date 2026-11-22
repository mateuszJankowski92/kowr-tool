import { AppError } from "../../errors/app-error.js";

export class ParcelNotFoundError extends AppError {
  constructor() {
    super({
      code: "PARCEL_NOT_FOUND",
      message: "No cadastral parcel was found for the supplied location or identifier.",
      statusCode: 404,
    });
  }
}

export class ParcelProviderUnavailableError extends AppError {
  constructor() {
    super({
      code: "PARCEL_PROVIDER_UNAVAILABLE",
      message: "The cadastral parcel service is temporarily unavailable. Please try again.",
      statusCode: 503,
    });
  }
}
