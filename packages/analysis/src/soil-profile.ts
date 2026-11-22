export const SOIL_PROFILE_DEPTH_INTERVALS = [
  { topDepthCm: 0, bottomDepthCm: 5 },
  { topDepthCm: 5, bottomDepthCm: 15 },
  { topDepthCm: 15, bottomDepthCm: 30 },
  { topDepthCm: 30, bottomDepthCm: 60 },
  { topDepthCm: 60, bottomDepthCm: 100 },
  { topDepthCm: 100, bottomDepthCm: 200 },
] as const;

export type AvailableWaterCapacity = {
  volumetricPercent: number;
  millimeters: number;
};

export type AvailableWaterCapacityRange = {
  using33Kpa: AvailableWaterCapacity | null;
  using10Kpa: AvailableWaterCapacity | null;
};

function calculateAvailableWaterCapacity(
  fieldCapacityPercent: number | null,
  wiltingPointPercent: number | null,
  layerThicknessCm: number,
): AvailableWaterCapacity | null {
  if (fieldCapacityPercent === null || wiltingPointPercent === null) return null;
  if (!Number.isFinite(fieldCapacityPercent) || !Number.isFinite(wiltingPointPercent)) return null;
  if (!Number.isFinite(layerThicknessCm) || layerThicknessCm <= 0) return null;

  const volumetricPercent = fieldCapacityPercent - wiltingPointPercent;
  if (volumetricPercent < 0) return null;

  return {
    volumetricPercent,
    millimeters: (volumetricPercent / 100) * layerThicknessCm * 10,
  };
}

export function calculateAvailableWaterCapacityRange(input: {
  waterContent10KpaPercent: number | null;
  waterContent33KpaPercent: number | null;
  waterContent1500KpaPercent: number | null;
  topDepthCm: number;
  bottomDepthCm: number;
}): AvailableWaterCapacityRange {
  const layerThicknessCm = input.bottomDepthCm - input.topDepthCm;

  return {
    using33Kpa: calculateAvailableWaterCapacity(
      input.waterContent33KpaPercent,
      input.waterContent1500KpaPercent,
      layerThicknessCm,
    ),
    using10Kpa: calculateAvailableWaterCapacity(
      input.waterContent10KpaPercent,
      input.waterContent1500KpaPercent,
      layerThicknessCm,
    ),
  };
}

export type GeographicPosition = readonly [longitude: number, latitude: number];
type LinearRing = readonly GeographicPosition[];
type PolygonCoordinates = readonly LinearRing[];

export type ParcelSurfaceGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: readonly PolygonCoordinates[] };

const EPSILON = 1e-12;
const SQUARED_EPSILON = EPSILON ** 2;

function ringDoubledArea(ring: LinearRing): number {
  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!current || !next) continue;
    area += current[0] * next[1] - next[0] * current[1];
  }

  return area;
}

function ringArea(ring: LinearRing): number {
  return Math.abs(ringDoubledArea(ring)) / 2;
}

function polygonArea(polygon: PolygonCoordinates): number {
  const [outerRing, ...holes] = polygon;
  if (!outerRing) return 0;

  return Math.max(0, ringArea(outerRing) - holes.reduce((sum, hole) => sum + ringArea(hole), 0));
}

function ringCentroid(ring: LinearRing): GeographicPosition | null {
  const doubledArea = ringDoubledArea(ring);
  if (Math.abs(doubledArea) <= EPSILON) return null;

  let longitudeSum = 0;
  let latitudeSum = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!current || !next) continue;

    const crossProduct = current[0] * next[1] - next[0] * current[1];
    longitudeSum += (current[0] + next[0]) * crossProduct;
    latitudeSum += (current[1] + next[1]) * crossProduct;
  }

  return [longitudeSum / (3 * doubledArea), latitudeSum / (3 * doubledArea)];
}

function isPointOnSegment(
  [longitude, latitude]: GeographicPosition,
  [startLongitude, startLatitude]: GeographicPosition,
  [endLongitude, endLatitude]: GeographicPosition,
): boolean {
  const squaredLength = (endLongitude - startLongitude) ** 2 + (endLatitude - startLatitude) ** 2;
  if (squaredLength <= SQUARED_EPSILON) {
    return (longitude - startLongitude) ** 2 + (latitude - startLatitude) ** 2 <= SQUARED_EPSILON;
  }

  const crossProduct =
    (longitude - startLongitude) * (endLatitude - startLatitude) -
    (latitude - startLatitude) * (endLongitude - startLongitude);
  if (Math.abs(crossProduct) > EPSILON) return false;

  const dotProduct =
    (longitude - startLongitude) * (endLongitude - startLongitude) +
    (latitude - startLatitude) * (endLatitude - startLatitude);
  if (dotProduct < -EPSILON) return false;

  return dotProduct <= squaredLength + EPSILON;
}

function locatePointInRing(
  point: GeographicPosition,
  ring: LinearRing,
): "inside" | "outside" | "boundary" {
  let inside = false;
  const [longitude, latitude] = point;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!current || !next) continue;
    if (isPointOnSegment(point, current, next)) return "boundary";

    const crossesLatitude = current[1] > latitude !== next[1] > latitude;
    if (!crossesLatitude) continue;

    const intersectionLongitude =
      ((next[0] - current[0]) * (latitude - current[1])) / (next[1] - current[1]) + current[0];
    if (longitude < intersectionLongitude) inside = !inside;
  }

  return inside ? "inside" : "outside";
}

function isInsidePolygon(point: GeographicPosition, polygon: PolygonCoordinates): boolean {
  const [outerRing, ...holes] = polygon;
  if (!outerRing || locatePointInRing(point, outerRing) !== "inside") return false;
  return holes.every((hole) => locatePointInRing(point, hole) === "outside");
}

function horizontalIntersections(polygon: PolygonCoordinates, latitude: number): number[] {
  const intersections: number[] = [];

  for (const ring of polygon) {
    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      if (!current || !next) continue;

      const crossesLatitude =
        (current[1] <= latitude && next[1] > latitude) ||
        (next[1] <= latitude && current[1] > latitude);
      if (!crossesLatitude) continue;

      intersections.push(
        current[0] + ((latitude - current[1]) * (next[0] - current[0])) / (next[1] - current[1]),
      );
    }
  }

  return intersections.sort((left, right) => left - right);
}

function scanlineInteriorPoint(polygon: PolygonCoordinates): GeographicPosition | null {
  const [outerRing] = polygon;
  if (!outerRing || outerRing.length < 3) return null;

  const latitudes = [...new Set(outerRing.map((position) => position[1]))].sort(
    (left, right) => left - right,
  );
  const candidateLatitudes: number[] = [];

  for (let index = 0; index < latitudes.length - 1; index += 1) {
    const lower = latitudes[index];
    const upper = latitudes[index + 1];
    if (lower === undefined || upper === undefined || upper - lower <= EPSILON) continue;
    candidateLatitudes.push((lower + upper) / 2);
  }

  let bestPoint: GeographicPosition | null = null;
  let bestWidth = 0;

  for (const latitude of candidateLatitudes) {
    const intersections = horizontalIntersections(polygon, latitude);

    for (let index = 0; index < intersections.length - 1; index += 1) {
      const startLongitude = intersections[index];
      const endLongitude = intersections[index + 1];
      if (
        startLongitude === undefined ||
        endLongitude === undefined ||
        endLongitude - startLongitude <= bestWidth
      ) {
        continue;
      }

      const point: GeographicPosition = [(startLongitude + endLongitude) / 2, latitude];
      if (!isInsidePolygon(point, polygon)) continue;

      bestPoint = point;
      bestWidth = endLongitude - startLongitude;
    }
  }

  return bestPoint;
}

function polygonInteriorPoint(polygon: PolygonCoordinates): GeographicPosition | null {
  const [outerRing] = polygon;
  if (!outerRing || polygonArea(polygon) <= EPSILON) return null;

  const centroid = ringCentroid(outerRing);
  if (centroid && isInsidePolygon(centroid, polygon)) return centroid;

  return scanlineInteriorPoint(polygon);
}

export function findRepresentativeInteriorPoint(
  geometry: ParcelSurfaceGeometry,
): GeographicPosition | null {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const largestFirst = [...polygons].sort((left, right) => polygonArea(right) - polygonArea(left));

  for (const polygon of largestFirst) {
    const point = polygonInteriorPoint(polygon);
    if (point) return point;
  }

  return null;
}
