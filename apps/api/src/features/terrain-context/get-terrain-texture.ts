import type { TerrainTextureResponse } from "@kowr/contracts";
import { ParcelNotFoundError, ParcelProviderUnavailableError } from "../parcels/parcel.errors.js";
import type { LocatedParcel, ParcelLocator } from "../parcels/parcel-locator.js";
import { ParcelLocatorError } from "../parcels/parcel-locator.js";
import { TerrainProviderUnavailableError } from "./terrain-context.errors.js";
import {
  createTerrainRequest,
  createTextureSize,
  projectParcelGeometry,
} from "./terrain-geometry.js";
import { TerrainProviderError, type TerrainTextureProvider } from "./terrain-provider.js";

export async function getTerrainTexture(
  parcelIdentifier: string,
  parcelLocator: ParcelLocator,
  textureProvider: TerrainTextureProvider,
  signal?: AbortSignal,
): Promise<TerrainTextureResponse> {
  let parcel: LocatedParcel | null;
  try {
    parcel = await parcelLocator.findByIdentifier(parcelIdentifier, signal);
  } catch (error) {
    if (error instanceof ParcelLocatorError) throw new ParcelProviderUnavailableError();
    throw error;
  }
  if (!parcel) throw new ParcelNotFoundError();

  const parcelGeometry = projectParcelGeometry(parcel.geometry);
  const { bounds } = createTerrainRequest(parcelGeometry);
  const size = createTextureSize(bounds);

  try {
    const texture = await textureProvider.getTexture(bounds, size.width, size.height, signal);
    return {
      imageDataUrl: `data:image/jpeg;base64,${texture.imageBase64}`,
      bounds,
      source: {
        provider: "GUGiK",
        dataset: "Ortofotomapa standardowa",
        horizontalCrs: "EPSG:2180",
        sourceDataDate: null,
        retrievedAt: texture.retrievedAt,
        usageTerms: "Free use under the Polish Geodetic and Cartographic Law",
      },
      limitations: [
        "The orthophoto date may differ from the terrain model and the requested analysis date.",
        "The coverage response does not expose the local source acquisition date.",
      ],
    };
  } catch (error) {
    if (error instanceof TerrainProviderError) throw new TerrainProviderUnavailableError();
    throw error;
  }
}
