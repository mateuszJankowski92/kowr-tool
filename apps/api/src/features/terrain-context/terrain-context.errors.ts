import { AppError } from "../../errors/app-error.js";

export class TerrainDataUnavailableError extends AppError {
  constructor() {
    super({
      code: "TERRAIN_DATA_UNAVAILABLE",
      message: "Terrain data is not available for this parcel.",
      statusCode: 422,
    });
  }
}

export class TerrainProviderUnavailableError extends AppError {
  constructor() {
    super({
      code: "TERRAIN_PROVIDER_UNAVAILABLE",
      message: "Terrain data is temporarily unavailable.",
      statusCode: 503,
    });
  }
}
