import type { TerrainBounds } from "@kowr/contracts";

export type ProvidedTerrainGrid = {
  columns: number;
  rows: number;
  bounds: TerrainBounds;
  cellSizeMeters: number;
  heightsMeters: (number | null)[];
  retrievedAt: string;
};

export type ProvidedTerrainTexture = {
  imageBase64: string;
  retrievedAt: string;
};

export class TerrainProviderError extends Error {
  readonly code: "INVALID_RESPONSE" | "NO_DATA" | "REQUEST_FAILED" | "TIMEOUT";

  constructor(code: TerrainProviderError["code"], cause?: unknown) {
    super("The terrain provider request could not be completed.", { cause });
    this.name = "TerrainProviderError";
    this.code = code;
  }
}

export interface TerrainProvider {
  getGrid(
    bounds: TerrainBounds,
    columns: number,
    rows: number,
    signal?: AbortSignal,
  ): Promise<ProvidedTerrainGrid>;
}

export interface TerrainTextureProvider {
  getTexture(
    bounds: TerrainBounds,
    width: number,
    height: number,
    signal?: AbortSignal,
  ): Promise<ProvidedTerrainTexture>;
}
