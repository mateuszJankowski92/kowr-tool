import type { FastifyBaseLogger } from "fastify";
import type {
  LocatedParcel,
  ParcelGeometry,
  ParcelLocator,
  ParcelPosition,
} from "../../features/parcels/parcel-locator.js";
import { ParcelLocatorError } from "../../features/parcels/parcel-locator.js";

const ULDK_URLS = ["https://uldk.gugik.gov.pl/"] as const;
const ULDK_RESULT_FIELDS = [
  "id",
  "parcel",
  "voivodeship",
  "county",
  "commune",
  "region",
  "datasource",
  "geom_wkt",
].join(",");

type UldkParcelLocatorOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

function optionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseWktCoordinates(input: string): unknown[] {
  let index = 0;

  const skipWhitespace = () => {
    while (/\s/.test(input[index] ?? "")) index += 1;
  };

  const parseNumber = (): number => {
    skipWhitespace();
    const match = input.slice(index).match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (!match) throw new ParcelLocatorError("INVALID_RESPONSE");
    index += match[0].length;
    return Number(match[0]);
  };

  const parsePosition = (): ParcelPosition => {
    const longitude = parseNumber();
    const latitude = parseNumber();
    skipWhitespace();

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new ParcelLocatorError("INVALID_RESPONSE");
    }

    return [longitude, latitude];
  };

  const parseGroup = (): unknown[] => {
    skipWhitespace();
    if (input[index] !== "(") throw new ParcelLocatorError("INVALID_RESPONSE");
    index += 1;

    const values: unknown[] = [];
    while (true) {
      skipWhitespace();
      values.push(input[index] === "(" ? parseGroup() : parsePosition());
      skipWhitespace();

      if (input[index] === ",") {
        index += 1;
        continue;
      }

      if (input[index] !== ")") throw new ParcelLocatorError("INVALID_RESPONSE");
      index += 1;
      return values;
    }
  };

  const coordinates = parseGroup();
  skipWhitespace();
  if (index !== input.length) throw new ParcelLocatorError("INVALID_RESPONSE");
  return coordinates;
}

function isPosition(value: unknown): value is ParcelPosition {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function isLinearRing(value: unknown): value is ParcelPosition[] {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function isPolygon(value: unknown): value is ParcelPosition[][] {
  return Array.isArray(value) && value.length >= 1 && value.every(isLinearRing);
}

function parseGeometry(value: string): ParcelGeometry {
  const normalized = value.trim().replace(/^SRID=4326;/i, "");
  const match = normalized.match(/^(POLYGON|MULTIPOLYGON)\s*(\(.*\))$/is);
  if (!match) throw new ParcelLocatorError("INVALID_RESPONSE");

  const geometryType = match[1]?.toUpperCase();
  const coordinateText = match[2];
  if (!coordinateText) throw new ParcelLocatorError("INVALID_RESPONSE");

  const coordinates = parseWktCoordinates(coordinateText);

  if (geometryType === "POLYGON" && coordinates.every(isLinearRing)) {
    return { type: "Polygon", coordinates };
  }

  if (geometryType === "MULTIPOLYGON" && coordinates.every(isPolygon)) {
    return { type: "MultiPolygon", coordinates };
  }

  throw new ParcelLocatorError("INVALID_RESPONSE");
}

function parseResponse(payload: string, retrievedAt: string): LocatedParcel | null {
  const lines = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const status = lines[0];

  if (!status || status.startsWith("-1")) return null;
  if (status !== "0" || !lines[1]) throw new ParcelLocatorError("INVALID_RESPONSE");

  const fields = lines[1].split("|");
  if (fields.length !== 8) throw new ParcelLocatorError("INVALID_RESPONSE");

  const [
    identifier,
    parcelNumber,
    voivodeship,
    county,
    commune,
    cadastralDistrict,
    datasource,
    geometry,
  ] = fields;

  if (!identifier || !parcelNumber || !geometry) {
    throw new ParcelLocatorError("INVALID_RESPONSE");
  }

  return {
    identifier,
    parcelNumber,
    geometry: parseGeometry(geometry),
    administrativeArea: {
      voivodeship: optionalText(voivodeship ?? ""),
      county: optionalText(county ?? ""),
      commune: optionalText(commune ?? ""),
      cadastralDistrict: optionalText(cadastralDistrict ?? ""),
    },
    provenance: {
      provider: "GUGiK ULDK",
      datasource: optionalText(datasource ?? ""),
      retrievedAt,
    },
  };
}

export function createUldkParcelLocator(options: UldkParcelLocatorOptions): ParcelLocator {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 8_000;

  const locate = async (parameters: URLSearchParams, signal?: AbortSignal) => {
    const startedAt = performance.now();

    try {
      let lastError: ParcelLocatorError | null = null;
      for (const url of ULDK_URLS) {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

        try {
          const response = await fetchImplementation(`${url}?${parameters.toString()}`, {
            headers: {
              Accept: "*/*",
              "User-Agent": "KOWR-Water-Assistant/0.1",
            },
            redirect: "manual",
            signal: requestSignal,
          });
          if (!response.ok) throw new ParcelLocatorError("REQUEST_FAILED");
          return parseResponse(await response.text(), now().toISOString());
        } catch (error) {
          if (error instanceof ParcelLocatorError && error.code === "INVALID_RESPONSE") throw error;
          if (signal?.aborted) throw error;
          lastError =
            error instanceof ParcelLocatorError
              ? error
              : new ParcelLocatorError(timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED", error);
        }
      }
      throw lastError ?? new ParcelLocatorError("REQUEST_FAILED");
    } catch (error) {
      const providerError =
        error instanceof ParcelLocatorError
          ? error
          : new ParcelLocatorError("REQUEST_FAILED", error);

      options.logger.warn(
        {
          provider: "GUGiK ULDK",
          durationMs: Math.round(performance.now() - startedAt),
          errorCode: `ULDK_${providerError.code}`,
        },
        "Parcel provider request failed",
      );
      throw providerError;
    }
  };

  const commonParameters = () =>
    new URLSearchParams({
      result: ULDK_RESULT_FIELDS,
      srid: "4326",
    });

  return {
    async findByIdentifier(identifier, signal) {
      const parameters = commonParameters();
      parameters.set("request", "GetParcelById");
      parameters.set("id", identifier.trim());
      return locate(parameters, signal);
    },
    async findByPoint(longitude, latitude, signal) {
      const parameters = commonParameters();
      parameters.set("request", "GetParcelByXY");
      parameters.set("xy", `${longitude},${latitude},4326`);
      return locate(parameters, signal);
    },
  };
}
