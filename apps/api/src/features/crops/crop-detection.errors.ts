import { AppError } from "../../errors/app-error.js";

export class CropProviderUnavailableError extends AppError {
  constructor() {
    super({
      code: "CROP_PROVIDER_UNAVAILABLE",
      message: "The ARiMR crop declaration service is temporarily unavailable. Please try again.",
      statusCode: 503,
    });
  }
}
