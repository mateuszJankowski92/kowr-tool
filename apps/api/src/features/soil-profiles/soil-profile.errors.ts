import { AppError } from "../../errors/app-error.js";

export class SoilProfileProviderUnavailableError extends AppError {
  constructor() {
    super({
      code: "SOIL_PROFILE_PROVIDER_UNAVAILABLE",
      message: "The soil profile service is temporarily unavailable. Please try again.",
      statusCode: 503,
    });
  }
}

export class SoilProfileLocationUnavailableError extends AppError {
  constructor() {
    super({
      code: "SOIL_PROFILE_LOCATION_UNAVAILABLE",
      message: "A representative soil profile location could not be derived from the parcel.",
      statusCode: 422,
    });
  }
}
