import type { FastifyBaseLogger } from "fastify";
import {
  type ProvidedTerrainGrid,
  type ProvidedTerrainTexture,
  type TerrainProvider,
  TerrainProviderError,
  type TerrainTextureProvider,
} from "../../features/terrain-context/terrain-provider.js";

const NMT_WCS_URL =
  "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel";
const ORTHOPHOTO_WMS_URL =
  "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution";
const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;

type GugikTerrainProviderOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

type ParsedArcGrid = {
  ncols: number;
  nrows: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
  noDataValue: number | null;
  values: (number | null)[];
};

function readHeader(lines: string[], key: string): number | null {
  const line = lines.find((candidate) => candidate.toLowerCase().startsWith(key.toLowerCase()));
  if (!line) return null;
  const value = Number(line.trim().split(/\s+/)[1]);
  return Number.isFinite(value) ? value : null;
}

function parseArcGrid(payload: string): ParsedArcGrid {
  const start = payload.search(/^ncols\s+/m);
  if (start < 0) throw new TerrainProviderError("INVALID_RESPONSE");
  const lines = payload.slice(start).split(/\r?\n/);
  const ncols = readHeader(lines, "ncols");
  const nrows = readHeader(lines, "nrows");
  const xllcorner = readHeader(lines, "xllcorner");
  const yllcorner = readHeader(lines, "yllcorner");
  const cellsize = readHeader(lines, "cellsize");
  const noDataValue = readHeader(lines, "NODATA_value");
  if (
    ncols === null ||
    nrows === null ||
    xllcorner === null ||
    yllcorner === null ||
    cellsize === null ||
    !Number.isInteger(ncols) ||
    !Number.isInteger(nrows) ||
    ncols < 2 ||
    nrows < 2 ||
    cellsize <= 0
  ) {
    throw new TerrainProviderError("INVALID_RESPONSE");
  }

  const headerLength = noDataValue === null ? 5 : 6;
  const tokens = lines.slice(headerLength).join(" ").trim().split(/\s+/);
  const numericValues = tokens
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value))
    .slice(0, ncols * nrows);
  if (numericValues.length !== ncols * nrows) {
    throw new TerrainProviderError("INVALID_RESPONSE");
  }

  return {
    ncols,
    nrows,
    xllcorner,
    yllcorner,
    cellsize,
    noDataValue,
    values: numericValues.map((value) => (value === noDataValue ? null : value)),
  };
}

function normalizeGrid(parsed: ParsedArcGrid, retrievedAt: string): ProvidedTerrainGrid {
  // GUGiK WCS follows EPSG:2180 northing/easting axis order. ArcGrid columns therefore run
  // south-to-north and rows run east-to-west. The public API normalizes this to rows north-to-south
  // and columns west-to-east so texture coordinates and parcel geometry use conventional GIS axes.
  const columns = parsed.nrows;
  const rows = parsed.ncols;
  const heightsMeters: (number | null)[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rawRow = parsed.nrows - 1 - column;
      const rawColumn = parsed.ncols - 1 - row;
      heightsMeters.push(parsed.values[rawRow * parsed.ncols + rawColumn] ?? null);
    }
  }

  if (heightsMeters.every((value) => value === null)) {
    throw new TerrainProviderError("NO_DATA");
  }

  return {
    columns,
    rows,
    bounds: {
      west: parsed.yllcorner,
      east: parsed.yllcorner + columns * parsed.cellsize,
      south: parsed.xllcorner,
      north: parsed.xllcorner + rows * parsed.cellsize,
    },
    cellSizeMeters: parsed.cellsize,
    heightsMeters,
    retrievedAt,
  };
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    timeoutSignal,
  };
}

function logFailure(
  logger: Pick<FastifyBaseLogger, "warn">,
  provider: string,
  startedAt: number,
  error: TerrainProviderError,
) {
  logger.warn(
    {
      provider,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: `GUGIK_${error.code}`,
    },
    "Terrain provider request failed",
  );
}

export function createGugikTerrainProvider(
  options: GugikTerrainProviderOptions,
): TerrainProvider & TerrainTextureProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    async getGrid(bounds, columns, rows, signal) {
      const startedAt = performance.now();
      const combined = requestSignal(signal, timeoutMs);
      const parameters = new URLSearchParams({
        SERVICE: "WCS",
        VERSION: "2.0.1",
        REQUEST: "GetCoverage",
        COVERAGEID: "DTM_PL-EVRF2007-NH",
        FORMAT: "image/x-aaigrid",
      });
      parameters.append("SUBSET", `x(${bounds.south},${bounds.north})`);
      parameters.append("SUBSET", `y(${bounds.west},${bounds.east})`);
      parameters.set("SCALESIZE", `x(${rows}),y(${columns})`);

      try {
        const response = await fetchImplementation(`${NMT_WCS_URL}?${parameters.toString()}`, {
          headers: { Accept: "image/x-aaigrid" },
          signal: combined.signal,
        });
        if (!response.ok) throw new TerrainProviderError("REQUEST_FAILED");
        return normalizeGrid(parseArcGrid(await response.text()), now().toISOString());
      } catch (error) {
        const providerError =
          error instanceof TerrainProviderError
            ? error
            : new TerrainProviderError(
                combined.timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
                error,
              );
        logFailure(options.logger, "GUGiK NMT WCS", startedAt, providerError);
        throw providerError;
      }
    },

    async getTexture(bounds, width, height, signal): Promise<ProvidedTerrainTexture> {
      const startedAt = performance.now();
      const combined = requestSignal(signal, timeoutMs);
      const parameters = new URLSearchParams({
        SERVICE: "WMS",
        VERSION: "1.1.1",
        REQUEST: "GetMap",
        LAYERS: "Raster",
        STYLES: "",
        SRS: "EPSG:2180",
        BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
        WIDTH: String(width),
        HEIGHT: String(height),
        FORMAT: "image/jpeg",
      });

      try {
        const response = await fetchImplementation(`${ORTHOPHOTO_WMS_URL}?${parameters}`, {
          headers: { Accept: "image/jpeg" },
          signal: combined.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")) {
          throw new TerrainProviderError("REQUEST_FAILED");
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_TEXTURE_BYTES) {
          throw new TerrainProviderError("INVALID_RESPONSE");
        }

        return {
          imageBase64: Buffer.from(bytes).toString("base64"),
          retrievedAt: now().toISOString(),
        };
      } catch (error) {
        const providerError =
          error instanceof TerrainProviderError
            ? error
            : new TerrainProviderError(
                combined.timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
                error,
              );
        logFailure(options.logger, "GUGiK ORTO WMS", startedAt, providerError);
        throw providerError;
      }
    },
  };
}
