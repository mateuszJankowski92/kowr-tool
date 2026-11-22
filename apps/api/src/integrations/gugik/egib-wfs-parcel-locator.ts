import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type {
  LocatedParcel,
  ParcelGeometry,
  ParcelLocator,
} from "../../features/parcels/parcel-locator.js";
import { ParcelLocatorError } from "../../features/parcels/parcel-locator.js";

const EGIB_WFS_URL = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza";
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const PositionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const LinearRingSchema = z.array(PositionSchema).min(4);
const PolygonCoordinatesSchema = z.array(LinearRingSchema).min(1);
const GeometrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("Polygon"),
      coordinates: PolygonCoordinatesSchema,
    })
    .passthrough(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(PolygonCoordinatesSchema).min(1),
    })
    .passthrough(),
]);

const FeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z
          .object({
            type: z.literal("Feature"),
            geometry: GeometrySchema,
            properties: z
              .object({
                ID_DZIALKI: z.string().trim().min(1).max(80),
                NUMER_DZIALKI: z.string().trim().min(1).max(80),
                NAZWA_OBREBU: z.string().max(300).nullable().optional(),
                NAZWA_GMINY: z.string().max(300).nullable().optional(),
                DATA: z.string().max(40).nullable().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(2),
  })
  .passthrough();

type EgibWfsParcelLocatorOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

type ParcelValidator = (parcel: LocatedParcel) => boolean;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character] ?? character;
  });
}

function identifierFilter(identifier: string): string {
  return [
    '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0">',
    "<fes:PropertyIsEqualTo>",
    "<fes:ValueReference>ID_DZIALKI</fes:ValueReference>",
    `<fes:Literal>${escapeXml(identifier.trim())}</fes:Literal>`,
    "</fes:PropertyIsEqualTo>",
    "</fes:Filter>",
  ].join("");
}

function pointFilter(longitude: number, latitude: number): string {
  return [
    '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" ',
    'xmlns:gml="http://www.opengis.net/gml/3.2">',
    "<fes:Intersects>",
    "<fes:ValueReference>geom</fes:ValueReference>",
    '<gml:Point srsName="EPSG:4326">',
    // WFS 2.0 applies the official EPSG:4326 axis order: latitude, longitude.
    `<gml:pos>${latitude} ${longitude}</gml:pos>`,
    "</gml:Point>",
    "</fes:Intersects>",
    "</fes:Filter>",
  ].join("");
}

function createRequestUrl(filter: string): URL {
  const url = new URL(EGIB_WFS_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", "ms:dzialki");
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set("COUNT", "2");
  url.searchParams.set("FILTER", filter);
  return url;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function pointInRing(
  longitude: number,
  latitude: number,
  ring: [number, number][],
): "inside" | "outside" | "boundary" {
  let inside = false;

  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index++
  ) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (!current || !previous) continue;
    const [currentLongitude, currentLatitude] = current;
    const [previousLongitude, previousLatitude] = previous;
    const crossProduct =
      (longitude - previousLongitude) * (currentLatitude - previousLatitude) -
      (latitude - previousLatitude) * (currentLongitude - previousLongitude);
    const onSegment =
      Math.abs(crossProduct) < 1e-12 &&
      longitude >= Math.min(previousLongitude, currentLongitude) &&
      longitude <= Math.max(previousLongitude, currentLongitude) &&
      latitude >= Math.min(previousLatitude, currentLatitude) &&
      latitude <= Math.max(previousLatitude, currentLatitude);
    if (onSegment) return "boundary";

    const crossesRay =
      currentLatitude > latitude !== previousLatitude > latitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude;
    if (crossesRay) inside = !inside;
  }

  return inside ? "inside" : "outside";
}

function polygonContainsPoint(
  longitude: number,
  latitude: number,
  polygon: [number, number][][],
): boolean {
  const exterior = polygon[0];
  if (!exterior || pointInRing(longitude, latitude, exterior) === "outside") return false;
  return polygon.slice(1).every((hole) => pointInRing(longitude, latitude, hole) !== "inside");
}

function geometryContainsPoint(
  geometry: ParcelGeometry,
  longitude: number,
  latitude: number,
): boolean {
  if (geometry.type === "Polygon") {
    return polygonContainsPoint(longitude, latitude, geometry.coordinates);
  }
  return geometry.coordinates.some((polygon) => polygonContainsPoint(longitude, latitude, polygon));
}

function parseResponse(payload: string, retrievedAt: string): LocatedParcel | null {
  let document: unknown;
  try {
    document = JSON.parse(payload);
  } catch (error) {
    throw new ParcelLocatorError("INVALID_RESPONSE", error);
  }

  const parsed = FeatureCollectionSchema.safeParse(document);
  if (!parsed.success) throw new ParcelLocatorError("INVALID_RESPONSE", parsed.error);
  if (parsed.data.features.length === 0) return null;
  if (parsed.data.features.length !== 1) {
    throw new ParcelLocatorError("INVALID_RESPONSE");
  }

  const feature = parsed.data.features[0];
  if (!feature) throw new ParcelLocatorError("INVALID_RESPONSE");
  const dataDate = optionalText(feature.properties.DATA);

  return {
    identifier: feature.properties.ID_DZIALKI,
    parcelNumber: feature.properties.NUMER_DZIALKI,
    geometry: feature.geometry as ParcelGeometry,
    administrativeArea: {
      voivodeship: null,
      county: null,
      commune: optionalText(feature.properties.NAZWA_GMINY),
      cadastralDistrict: optionalText(feature.properties.NAZWA_OBREBU),
    },
    provenance: {
      provider: "GUGiK EGiB WFS",
      datasource: dataDate ? `Aggregated EGiB WFS snapshot ${dataDate}` : "Aggregated EGiB WFS",
      retrievedAt,
    },
  };
}

export function createEgibWfsParcelLocator(options: EgibWfsParcelLocatorOptions): ParcelLocator {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 8_000;

  const locate = async (filter: string, validateParcel: ParcelValidator, signal?: AbortSignal) => {
    const startedAt = performance.now();
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    try {
      const response = await fetchImplementation(createRequestUrl(filter), {
        headers: {
          Accept: "application/json",
          "User-Agent": "KOWR-Water-Assistant/0.1",
        },
        signal: requestSignal,
      });
      if (!response.ok) throw new ParcelLocatorError("REQUEST_FAILED");

      const contentType = response.headers.get("content-type");
      const contentLength = Number(response.headers.get("content-length"));
      if (
        !contentType?.toLowerCase().startsWith("application/json") ||
        (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)
      ) {
        throw new ParcelLocatorError("INVALID_RESPONSE");
      }

      const payload = await response.text();
      if (payload.length > MAX_RESPONSE_BYTES) {
        throw new ParcelLocatorError("INVALID_RESPONSE");
      }
      const parcel = parseResponse(payload, now().toISOString());
      if (parcel && !validateParcel(parcel)) {
        throw new ParcelLocatorError("INVALID_RESPONSE");
      }
      return parcel;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const providerError =
        error instanceof ParcelLocatorError
          ? error
          : new ParcelLocatorError(timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED", error);
      options.logger.warn(
        {
          provider: "GUGiK EGiB WFS",
          durationMs: Math.round(performance.now() - startedAt),
          errorCode: `EGIB_WFS_${providerError.code}`,
        },
        "Parcel fallback provider request failed",
      );
      throw providerError;
    }
  };

  return {
    findByIdentifier(identifier, signal) {
      const normalizedIdentifier = identifier.trim();
      return locate(
        identifierFilter(normalizedIdentifier),
        (parcel) => parcel.identifier === normalizedIdentifier,
        signal,
      );
    },
    findByPoint(longitude, latitude, signal) {
      return locate(
        pointFilter(longitude, latitude),
        (parcel) => geometryContainsPoint(parcel.geometry, longitude, latitude),
        signal,
      );
    },
  };
}
