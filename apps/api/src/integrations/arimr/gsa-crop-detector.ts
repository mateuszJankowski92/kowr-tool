import type { ParcelGeometry } from "@kowr/contracts";
import type { FastifyBaseLogger } from "fastify";
import polygonClipping, { type MultiPolygon, type Pair, type Polygon } from "polygon-clipping";
import proj4 from "proj4";
import { z } from "zod";
import {
  type CropDetector,
  CropDetectorError,
  type CropIntersection,
} from "../../features/crops/crop-detector.js";

const GSA_WFS_URL = "https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_2025/wfs";
const GSA_FEATURE_TYPE = "gsa_public:uprawy_rolne_2025";
const MAX_FEATURES = 500;
const MIN_OVERLAP_AREA_SQUARE_METERS = 1;
const EPSG_2180_DEFINITION =
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs";

proj4.defs("EPSG:2180", EPSG_2180_DEFINITION);

const GsaPositionSchema = z.tuple([z.number(), z.number()]);
const GsaRingSchema = z.array(GsaPositionSchema).min(4);
const GsaPolygonSchema = z.array(GsaRingSchema).min(1);
const GsaGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: GsaPolygonSchema }).passthrough(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(GsaPolygonSchema).min(1),
    })
    .passthrough(),
]);
const GsaResponseSchema = z
  .object({
    features: z.array(
      z
        .object({
          geometry: GsaGeometrySchema.nullable(),
          properties: z
            .object({
              roslina: z.string().nullable(),
              grupa_roslin: z.string().nullable(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
    numberMatched: z.number().nonnegative(),
  })
  .passthrough();

type GsaCropDetectorOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  projectPosition?: (position: Pair) => Pair;
  timeoutMs?: number;
};

function closeRing(ring: Pair[]): Pair[] {
  const first = ring[0];
  const last = ring.at(-1);
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function toMultiPolygon(
  geometry: ParcelGeometry,
  projectPosition: (position: Pair) => Pair,
): MultiPolygon {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) =>
    polygon.map((ring) => closeRing(ring.map((position) => projectPosition(position)))),
  );
}

function providerGeometryToMultiPolygon(
  geometry: z.infer<typeof GsaGeometrySchema>,
  projectPosition: (position: Pair) => Pair,
): MultiPolygon {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) =>
    polygon.map((ring) => closeRing(ring.map((position) => projectPosition(position)))),
  );
}

function ringArea(ring: Pair[]): number {
  let doubledArea = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) continue;
    doubledArea += current[0] * next[1] - next[0] * current[1];
  }

  return Math.abs(doubledArea) / 2;
}

function polygonArea(polygon: Polygon): number {
  const [outerRing, ...holes] = polygon;
  if (!outerRing) return 0;
  return Math.max(0, ringArea(outerRing) - holes.reduce((sum, hole) => sum + ringArea(hole), 0));
}

function multiPolygonArea(multiPolygon: MultiPolygon): number {
  return multiPolygon.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

// ARiMR's WFS follows the declared EPSG:2180 northing/easting axis order in CQL literals.
function toWkt(multiPolygon: MultiPolygon): string {
  const polygons = multiPolygon.map(
    (polygon) =>
      `(${polygon
        .map((ring) => `(${ring.map(([x, y]) => `${y.toFixed(3)} ${x.toFixed(3)}`).join(",")})`)
        .join(",")})`,
  );
  return `MULTIPOLYGON(${polygons.join(",")})`;
}

function createRequestBody(parcel: MultiPolygon): URLSearchParams {
  return new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    version: "2.0.0",
    typeNames: GSA_FEATURE_TYPE,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    propertyName: "roslina,grupa_roslin,geometry",
    count: String(MAX_FEATURES),
    cql_filter: `INTERSECTS(geometry,${toWkt(parcel)})`,
  });
}

export function createGsaCropDetector(options: GsaCropDetectorOptions): CropDetector {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const projectPosition =
    options.projectPosition ??
    ((position: Pair) => {
      const projected = proj4("EPSG:4326", "EPSG:2180", position);
      return [projected[0], projected[1]];
    });
  const timeoutMs = options.timeoutMs ?? 12_000;

  return {
    async findIntersections(geometry, signal) {
      const startedAt = performance.now();
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      try {
        const parcel = toMultiPolygon(geometry, projectPosition);
        const parcelAreaSquareMeters = multiPolygonArea(parcel);
        if (parcelAreaSquareMeters <= 0) throw new CropDetectorError("INVALID_RESPONSE");

        const response = await fetchImplementation(GSA_WFS_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: createRequestBody(parcel),
          signal: requestSignal,
        });
        if (!response.ok) throw new CropDetectorError("REQUEST_FAILED");

        const parsed = GsaResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new CropDetectorError("INVALID_RESPONSE", parsed.error);

        const intersections: CropIntersection[] = [];
        for (const feature of parsed.data.features) {
          if (!feature.geometry || !feature.properties.roslina) continue;

          const overlapAreaSquareMeters = multiPolygonArea(
            polygonClipping.intersection(
              parcel,
              providerGeometryToMultiPolygon(feature.geometry, projectPosition),
            ),
          );
          if (overlapAreaSquareMeters < MIN_OVERLAP_AREA_SQUARE_METERS) continue;

          intersections.push({
            overlapAreaSquareMeters,
            sourceGroup: feature.properties.grupa_roslin ?? "brak",
            sourceLabel: feature.properties.roslina,
          });
        }

        return {
          complete: parsed.data.numberMatched <= parsed.data.features.length,
          intersections,
          parcelAreaSquareMeters,
          retrievedAt: now().toISOString(),
        };
      } catch (error) {
        const providerError =
          error instanceof CropDetectorError
            ? error
            : new CropDetectorError(timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED", error);

        options.logger.warn(
          {
            provider: "ARiMR GSA",
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: `ARIMR_GSA_${providerError.code}`,
          },
          "Crop declaration provider request failed",
        );
        throw providerError;
      }
    },
  };
}
