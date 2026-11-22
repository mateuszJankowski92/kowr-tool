import {
  type TerrainContextResponse,
  TerrainContextResponseSchema,
  type TerrainTextureResponse,
  TerrainTextureResponseSchema,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

export function getTerrainContext(
  parcelIdentifier: string,
  signal?: AbortSignal,
): Promise<TerrainContextResponse> {
  const search = new URLSearchParams({ parcelIdentifier });
  return requestJson(`/api/terrain-contexts?${search.toString()}`, TerrainContextResponseSchema, {
    signal,
  });
}

export function getTerrainTexture(
  parcelIdentifier: string,
  signal?: AbortSignal,
): Promise<TerrainTextureResponse> {
  const search = new URLSearchParams({ parcelIdentifier });
  return requestJson(`/api/terrain-textures?${search.toString()}`, TerrainTextureResponseSchema, {
    signal,
  });
}
