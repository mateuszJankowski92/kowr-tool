import { AppError } from "../../errors/app-error.js";

export class AnalysisDateInFutureError extends AppError {
  constructor() {
    super({
      code: "ANALYSIS_DATE_IN_FUTURE",
      message: "The analysis date must not be later than today.",
      statusCode: 422,
    });
  }
}

export class AnalysisLocationUnavailableError extends AppError {
  constructor() {
    super({
      code: "ANALYSIS_LOCATION_UNAVAILABLE",
      message: "A representative analysis location could not be derived from the parcel.",
      statusCode: 422,
    });
  }
}
