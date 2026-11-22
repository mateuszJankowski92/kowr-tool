import type { HydrologyFeature, HydrologyKind, LandUseFeature, LandUseKind } from "@kowr/analysis";
import type { ParcelGeometry } from "@kowr/contracts";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import {
  type ProvidedSurroundings,
  type SurroundingsProvider,
  SurroundingsProviderError,
} from "../../features/terrain-context/surroundings-provider.js";
import { projectWgs84Position } from "../../features/terrain-context/terrain-geometry.js";

const DEFAULT_ENDPOINTS = [
  "https://ovp.dresel.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
] as const;
const SEARCH_RADIUS_METERS = 1_000;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1_000;

const OsmCoordinateSchema = z.object({
  lat: z.number().finite(),
  lon: z.number().finite(),
});
const OsmTagsSchema = z.record(z.string(), z.string());
const OsmWaySchema = z.object({
  type: z.literal("way"),
  id: z.number().int(),
  tags: OsmTagsSchema.optional(),
  geometry: z.array(OsmCoordinateSchema).max(20_000).optional(),
});
const OsmRelationSchema = z.object({
  type: z.literal("relation"),
  id: z.number().int(),
  tags: OsmTagsSchema.optional(),
  members: z
    .array(
      z.object({
        type: z.string(),
        ref: z.number().int(),
        role: z.string().optional(),
        geometry: z.array(OsmCoordinateSchema).max(20_000).optional(),
      }),
    )
    .max(10_000)
    .optional(),
});
const OverpassResponseSchema = z.object({
  remark: z.string().optional(),
  osm3s: z.object({
    timestamp_osm_base: z.iso.datetime({ offset: true }),
  }),
  elements: z.array(z.discriminatedUnion("type", [OsmWaySchema, OsmRelationSchema])).max(10_000),
});

type OsmCoordinate = z.infer<typeof OsmCoordinateSchema>;
type OsmElement = z.infer<typeof OverpassResponseSchema>["elements"][number];
type Tags = Record<string, string>;

type OpenStreetMapSurroundingsProviderOptions = {
  endpoints?: readonly string[];
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

function geometryPositions(geometry: ParcelGeometry): [number, number][] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flat(2);
}

function createSearchBounds(geometry: ParcelGeometry) {
  const positions = geometryPositions(geometry);
  const latitudes = positions.map(([, latitude]) => latitude);
  const longitudes = positions.map(([longitude]) => longitude);
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const latitudeDelta = SEARCH_RADIUS_METERS / 111_320;
  const longitudeDelta =
    SEARCH_RADIUS_METERS / (111_320 * Math.max(0.2, Math.cos((centerLatitude * Math.PI) / 180)));
  return {
    south: Math.min(...latitudes) - latitudeDelta,
    west: Math.min(...longitudes) - longitudeDelta,
    north: Math.max(...latitudes) + latitudeDelta,
    east: Math.max(...longitudes) + longitudeDelta,
  };
}

function buildQuery(bounds: ReturnType<typeof createSearchBounds>) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:8];(
way["waterway"~"^(river|stream|canal|ditch|drain)$"](${bbox});
rel["waterway"~"^(river|stream|canal|ditch|drain)$"](${bbox});
way["natural"="water"](${bbox});
rel["natural"="water"](${bbox});
way["natural"="wetland"](${bbox});
rel["natural"="wetland"](${bbox});
way["landuse"](${bbox});
rel["landuse"](${bbox});
way["natural"~"^(wood|scrub|heath|grassland|bare_rock|sand|mud)$"](${bbox});
rel["natural"~"^(wood|scrub|heath|grassland|bare_rock|sand|mud)$"](${bbox});
way["leisure"="park"](${bbox});
rel["leisure"="park"](${bbox});
way["amenity"="grave_yard"](${bbox});
rel["amenity"="grave_yard"](${bbox});
);out meta geom;`;
}

function samePosition(left: OsmCoordinate, right: OsmCoordinate) {
  return Math.abs(left.lat - right.lat) < 1e-9 && Math.abs(left.lon - right.lon) < 1e-9;
}

function closedRing(coordinates: OsmCoordinate[]): OsmCoordinate[] | null {
  if (coordinates.length < 3) return null;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last) return null;
  return samePosition(first, last) ? coordinates : null;
}

function relationRings(
  element: Extract<OsmElement, { type: "relation" }>,
  role: "outer" | "inner",
) {
  const fragments = (element.members ?? [])
    .filter(
      (member) =>
        member.type === "way" &&
        (role === "inner" ? member.role === "inner" : member.role !== "inner"),
    )
    .flatMap((member) => (member.geometry && member.geometry.length >= 2 ? [member.geometry] : []));
  const rings: OsmCoordinate[][] = [];

  while (fragments.length > 0) {
    const current = [...(fragments.shift() ?? [])];
    let joined = true;
    while (joined && current.length > 0) {
      joined = false;
      const currentEnd = current.at(-1);
      const currentStart = current[0];
      if (!currentEnd || !currentStart || samePosition(currentStart, currentEnd)) break;
      const matchIndex = fragments.findIndex((fragment) => {
        const first = fragment[0];
        const last = fragment.at(-1);
        return Boolean(
          first && last && (samePosition(currentEnd, first) || samePosition(currentEnd, last)),
        );
      });
      if (matchIndex < 0) break;
      const [match] = fragments.splice(matchIndex, 1);
      if (!match) break;
      const ordered = samePosition(currentEnd, match[0] ?? currentEnd)
        ? match
        : [...match].reverse();
      current.push(...ordered.slice(1));
      joined = true;
    }
    const ring = closedRing(current);
    const first = ring?.[0];
    const last = ring?.at(-1);
    if (ring && first && last && samePosition(first, last)) rings.push(ring);
  }

  return rings;
}

function elementPolygons(element: OsmElement): OsmCoordinate[][][] {
  if (element.type === "relation") {
    const innerRings = relationRings(element, "inner");
    return relationRings(element, "outer").map((outerRing) => [outerRing, ...innerRings]);
  }
  if (!element.geometry) return [];
  const ring = closedRing(element.geometry);
  const first = ring?.[0];
  const last = ring?.at(-1);
  return ring && first && last && samePosition(first, last) ? [[ring]] : [];
}

function projectCoordinates(coordinates: readonly OsmCoordinate[]) {
  return coordinates.map(({ lat, lon }) => projectWgs84Position([lon, lat]));
}

function hydrologyKind(tags: Tags): HydrologyKind | null {
  const waterway = tags.waterway;
  if (
    waterway === "river" ||
    waterway === "stream" ||
    waterway === "canal" ||
    waterway === "ditch" ||
    waterway === "drain"
  ) {
    return waterway;
  }
  if (tags.natural === "wetland") return "wetland";
  if (tags.natural === "water" || tags.landuse === "reservoir") {
    if (tags.water === "pond") return "pond";
    if (tags.water === "reservoir" || tags.landuse === "reservoir") return "reservoir";
    if (tags.water === "lake") return "lake";
    return "other-water";
  }
  return null;
}

function landUseKind(tags: Tags): LandUseKind | null {
  if (tags.natural === "water" || tags.landuse === "reservoir" || tags.landuse === "basin") {
    return "water";
  }
  if (tags.natural === "wetland") return "wetland";
  if (tags.natural === "wood" || tags.landuse === "forest") return "forest";
  if (
    tags.landuse === "farmland" ||
    tags.landuse === "farmyard" ||
    tags.landuse === "orchard" ||
    tags.landuse === "vineyard" ||
    tags.landuse === "plant_nursery" ||
    tags.landuse === "greenhouse_horticulture"
  ) {
    return "agriculture";
  }
  if (
    tags.landuse === "grass" ||
    tags.landuse === "meadow" ||
    tags.landuse === "recreation_ground" ||
    tags.landuse === "village_green" ||
    tags.natural === "grassland" ||
    tags.natural === "heath" ||
    tags.natural === "scrub" ||
    tags.leisure === "park" ||
    tags.amenity === "grave_yard"
  ) {
    return "grassland";
  }
  if (
    tags.landuse === "residential" ||
    tags.landuse === "commercial" ||
    tags.landuse === "industrial" ||
    tags.landuse === "retail" ||
    tags.landuse === "construction" ||
    tags.landuse === "military" ||
    tags.landuse === "railway" ||
    tags.landuse === "landfill" ||
    tags.landuse === "quarry"
  ) {
    return "built-up";
  }
  if (tags.natural === "bare_rock" || tags.natural === "sand" || tags.natural === "mud") {
    return "other";
  }
  return null;
}

function elementId(element: OsmElement) {
  return `${element.type}/${element.id}`;
}

function toFeatures(elements: readonly OsmElement[]) {
  const hydrologyFeatures: HydrologyFeature[] = [];
  const landUseFeatures: LandUseFeature[] = [];

  for (const element of elements) {
    const tags = element.tags ?? {};
    const hydrology = hydrologyKind(tags);
    const landUse = landUseKind(tags);
    if (!hydrology && !landUse) continue;

    const mappedPolygons = elementPolygons(element);
    if (hydrology && tags.waterway && element.type === "way" && element.geometry?.length) {
      hydrologyFeatures.push({
        id: elementId(element),
        kind: hydrology,
        name: tags["name:pl"] ?? tags.name ?? null,
        geometry: { type: "LineString", coordinates: projectCoordinates(element.geometry) },
      });
    } else if (hydrology) {
      for (const [index, polygon] of mappedPolygons.entries()) {
        hydrologyFeatures.push({
          id: `${elementId(element)}:${index}`,
          kind: hydrology,
          name: tags["name:pl"] ?? tags.name ?? null,
          geometry: {
            type: "Polygon",
            coordinates: polygon.map(projectCoordinates),
          },
        });
      }
    }

    if (landUse) {
      for (const [index, polygon] of mappedPolygons.entries()) {
        landUseFeatures.push({
          id: `${elementId(element)}:${index}`,
          kind: landUse,
          geometry: {
            type: "Polygon",
            coordinates: polygon.map(projectCoordinates),
          },
        });
      }
    }
  }

  return { hydrologyFeatures, landUseFeatures };
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    timeoutSignal,
  };
}

async function requestOverpass(
  endpoint: string,
  query: string,
  fetchImplementation: typeof globalThis.fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const request = combinedSignal(signal, timeoutMs);
  try {
    const response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "KOWR-Water-Assistant/0.1",
      },
      body: new URLSearchParams({ data: query }),
      signal: request.signal,
    });
    if (!response.ok) throw new SurroundingsProviderError("REQUEST_FAILED");
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new SurroundingsProviderError("INVALID_RESPONSE");
    }
    const payload = await response.text();
    if (Buffer.byteLength(payload) > MAX_RESPONSE_BYTES) {
      throw new SurroundingsProviderError("INVALID_RESPONSE");
    }
    const parsed = OverpassResponseSchema.parse(JSON.parse(payload));
    if (parsed.remark) throw new SurroundingsProviderError("REQUEST_FAILED");
    return parsed;
  } catch (error) {
    if (error instanceof SurroundingsProviderError) throw error;
    throw new SurroundingsProviderError(
      request.timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
      error,
    );
  }
}

export function createOpenStreetMapSurroundingsProvider(
  options: OpenStreetMapSurroundingsProviderOptions,
): SurroundingsProvider {
  const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 9_000;
  const cache = new Map<string, { expiresAt: number; value: ProvidedSurroundings }>();

  return {
    async getFeatures(geometry, signal) {
      const bounds = createSearchBounds(geometry);
      const cacheKey = [bounds.south, bounds.west, bounds.north, bounds.east]
        .map((value) => value.toFixed(5))
        .join(":");
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now().getTime()) return cached.value;
      const query = buildQuery(bounds);
      let finalError: SurroundingsProviderError | undefined;

      for (const endpoint of endpoints) {
        const startedAt = performance.now();
        try {
          const response = await requestOverpass(
            endpoint,
            query,
            fetchImplementation,
            signal,
            timeoutMs,
          );
          const features = toFeatures(response.elements);
          const value: ProvidedSurroundings = {
            searchRadiusMeters: SEARCH_RADIUS_METERS,
            ...features,
            source: {
              snapshotAt: response.osm3s.timestamp_osm_base,
              retrievedAt: now().toISOString(),
              sourceUrl: "https://www.openstreetmap.org/copyright",
            },
          };
          cache.set(cacheKey, { expiresAt: now().getTime() + CACHE_TTL_MS, value });
          return value;
        } catch (error) {
          const providerError =
            error instanceof SurroundingsProviderError
              ? error
              : new SurroundingsProviderError("REQUEST_FAILED", error);
          finalError = providerError;
          options.logger.warn(
            {
              provider: "OpenStreetMap Overpass",
              endpointHost: new URL(endpoint).host,
              durationMs: Math.round(performance.now() - startedAt),
              errorCode: `OVERPASS_${providerError.code}`,
            },
            "Parcel surroundings provider request failed",
          );
          if (providerError.code === "INVALID_RESPONSE" || signal?.aborted) break;
        }
      }

      throw finalError ?? new SurroundingsProviderError("REQUEST_FAILED");
    },
  };
}
