import type { TerrainParcelGeometry, TerrainPosition } from "./terrain-analysis.js";

export type HydrologyKind =
  | "river"
  | "stream"
  | "canal"
  | "ditch"
  | "drain"
  | "lake"
  | "pond"
  | "reservoir"
  | "wetland"
  | "other-water";

export type LandUseKind =
  | "agriculture"
  | "forest"
  | "grassland"
  | "wetland"
  | "water"
  | "built-up"
  | "other";

type LineGeometry = {
  type: "LineString";
  coordinates: readonly TerrainPosition[];
};

type PolygonGeometry = {
  type: "Polygon";
  coordinates: readonly (readonly TerrainPosition[])[];
};

export type HydrologyFeature = {
  id: string;
  kind: HydrologyKind;
  name: string | null;
  geometry: LineGeometry | PolygonGeometry;
};

export type LandUseFeature = {
  id: string;
  kind: LandUseKind;
  geometry: PolygonGeometry;
};

export type ParcelSurroundingsAnalysisInput = {
  parcelGeometry: TerrainParcelGeometry;
  hydrologyFeatures: readonly HydrologyFeature[];
  landUseFeatures: readonly LandUseFeature[];
  searchRadiusMeters: number;
  maximumHydrologyObjects?: number;
  landUseSamplesPerAxis?: number;
};

export type ParcelSurroundingsAnalysis = {
  hydrology: {
    searchRadiusMeters: number;
    objectCount: number;
    nearestDistanceMeters: number | null;
    intersectsParcel: boolean;
    objects: Array<{
      id: string;
      kind: HydrologyKind;
      name: string | null;
      distanceMeters: number;
      relation: "intersects-parcel" | "adjacent" | "nearby";
    }>;
  };
  landUse: {
    coveragePercent: number;
    dominantClass: LandUseKind | null;
    sampledPointCount: number;
    classifiedPointCount: number;
    sampleSpacingMeters: number | null;
    classes: Array<{
      kind: LandUseKind;
      areaPercent: number;
      sampledPointCount: number;
    }>;
  };
};

const EPSILON = 1e-8;
const LAND_USE_PRIORITY: Record<LandUseKind, number> = {
  water: 70,
  wetland: 60,
  "built-up": 50,
  agriculture: 40,
  forest: 30,
  grassland: 20,
  other: 10,
};

type TerrainRing = readonly TerrainPosition[];
type TerrainPolygon = readonly TerrainRing[];

function polygons(geometry: TerrainParcelGeometry): readonly TerrainPolygon[] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function squaredDistance(left: TerrainPosition, right: TerrainPosition): number {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2;
}

function pointToSegmentDistance(
  point: TerrainPosition,
  start: TerrainPosition,
  end: TerrainPosition,
): number {
  const lengthSquared = squaredDistance(start, end);
  if (lengthSquared <= EPSILON) return Math.sqrt(squaredDistance(point, start));
  const fraction = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])) /
        lengthSquared,
    ),
  );
  const projection: TerrainPosition = [
    start[0] + fraction * (end[0] - start[0]),
    start[1] + fraction * (end[1] - start[1]),
  ];
  return Math.sqrt(squaredDistance(point, projection));
}

function orientation(first: TerrainPosition, second: TerrainPosition, third: TerrainPosition) {
  return (
    (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0])
  );
}

function isPointOnSegment(point: TerrainPosition, start: TerrainPosition, end: TerrainPosition) {
  if (Math.abs(orientation(start, end, point)) > EPSILON) return false;
  return (
    point[0] >= Math.min(start[0], end[0]) - EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + EPSILON
  );
}

function segmentsIntersect(
  firstStart: TerrainPosition,
  firstEnd: TerrainPosition,
  secondStart: TerrainPosition,
  secondEnd: TerrainPosition,
) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (
    ((firstOrientation > EPSILON && secondOrientation < -EPSILON) ||
      (firstOrientation < -EPSILON && secondOrientation > EPSILON)) &&
    ((thirdOrientation > EPSILON && fourthOrientation < -EPSILON) ||
      (thirdOrientation < -EPSILON && fourthOrientation > EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(firstOrientation) <= EPSILON &&
      isPointOnSegment(secondStart, firstStart, firstEnd)) ||
    (Math.abs(secondOrientation) <= EPSILON && isPointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(thirdOrientation) <= EPSILON &&
      isPointOnSegment(firstStart, secondStart, secondEnd)) ||
    (Math.abs(fourthOrientation) <= EPSILON && isPointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function segmentDistance(
  firstStart: TerrainPosition,
  firstEnd: TerrainPosition,
  secondStart: TerrainPosition,
  secondEnd: TerrainPosition,
) {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    pointToSegmentDistance(firstStart, secondStart, secondEnd),
    pointToSegmentDistance(firstEnd, secondStart, secondEnd),
    pointToSegmentDistance(secondStart, firstStart, firstEnd),
    pointToSegmentDistance(secondEnd, firstStart, firstEnd),
  );
}

function ringSegments(ring: TerrainRing): Array<[TerrainPosition, TerrainPosition]> {
  const segments: Array<[TerrainPosition, TerrainPosition]> = [];
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if (start && end && squaredDistance(start, end) > EPSILON) segments.push([start, end]);
  }
  return segments;
}

function locatePointInRing(point: TerrainPosition, ring: TerrainRing) {
  let inside = false;
  for (const [start, end] of ringSegments(ring)) {
    if (isPointOnSegment(point, start, end)) return "boundary" as const;
    const crossesY = start[1] > point[1] !== end[1] > point[1];
    if (!crossesY) continue;
    const intersectionX =
      ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0];
    if (point[0] < intersectionX) inside = !inside;
  }
  return inside ? ("inside" as const) : ("outside" as const);
}

function isPointInPolygon(point: TerrainPosition, polygon: TerrainPolygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || locatePointInRing(point, outer) === "outside") return false;
  return holes.every((hole) => locatePointInRing(point, hole) === "outside");
}

function isPointInParcel(point: TerrainPosition, geometry: TerrainParcelGeometry): boolean {
  return polygons(geometry).some((polygon) => isPointInPolygon(point, polygon));
}

function polygonIntersectsParcel(
  polygon: TerrainPolygon,
  parcelGeometry: TerrainParcelGeometry,
): boolean {
  const polygonOuter = polygon[0];
  if (!polygonOuter) return false;
  if (polygonOuter.some((point) => isPointInParcel(point, parcelGeometry))) return true;

  for (const parcelPolygon of polygons(parcelGeometry)) {
    const parcelOuter = parcelPolygon[0];
    if (parcelOuter?.some((point) => isPointInPolygon(point, polygon))) return true;
    for (const polygonRing of polygon) {
      for (const parcelRing of parcelPolygon) {
        for (const [polygonStart, polygonEnd] of ringSegments(polygonRing)) {
          for (const [parcelStart, parcelEnd] of ringSegments(parcelRing)) {
            if (segmentsIntersect(polygonStart, polygonEnd, parcelStart, parcelEnd)) return true;
          }
        }
      }
    }
  }
  return false;
}

function lineDistanceToParcel(
  line: readonly TerrainPosition[],
  parcelGeometry: TerrainParcelGeometry,
): number {
  if (line.some((point) => isPointInParcel(point, parcelGeometry))) return 0;
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < line.length - 1; index += 1) {
    const lineStart = line[index];
    const lineEnd = line[index + 1];
    if (!lineStart || !lineEnd) continue;
    for (const parcelPolygon of polygons(parcelGeometry)) {
      for (const parcelRing of parcelPolygon) {
        for (const [parcelStart, parcelEnd] of ringSegments(parcelRing)) {
          minimumDistance = Math.min(
            minimumDistance,
            segmentDistance(lineStart, lineEnd, parcelStart, parcelEnd),
          );
        }
      }
    }
  }
  return minimumDistance;
}

function polygonDistanceToParcel(
  polygon: TerrainPolygon,
  parcelGeometry: TerrainParcelGeometry,
): number {
  if (polygonIntersectsParcel(polygon, parcelGeometry)) return 0;
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (const polygonRing of polygon) {
    for (const [polygonStart, polygonEnd] of ringSegments(polygonRing)) {
      for (const parcelPolygon of polygons(parcelGeometry)) {
        for (const parcelRing of parcelPolygon) {
          for (const [parcelStart, parcelEnd] of ringSegments(parcelRing)) {
            minimumDistance = Math.min(
              minimumDistance,
              segmentDistance(polygonStart, polygonEnd, parcelStart, parcelEnd),
            );
          }
        }
      }
    }
  }
  return minimumDistance;
}

function geometryDistanceToParcel(
  geometry: LineGeometry | PolygonGeometry,
  parcelGeometry: TerrainParcelGeometry,
): number {
  return geometry.type === "LineString"
    ? lineDistanceToParcel(geometry.coordinates, parcelGeometry)
    : polygonDistanceToParcel(geometry.coordinates, parcelGeometry);
}

function parcelBounds(geometry: TerrainParcelGeometry) {
  const allPositions = polygons(geometry).flat(2);
  return {
    west: Math.min(...allPositions.map(([x]) => x)),
    east: Math.max(...allPositions.map(([x]) => x)),
    south: Math.min(...allPositions.map(([, y]) => y)),
    north: Math.max(...allPositions.map(([, y]) => y)),
  };
}

function analyzeLandUse(
  parcelGeometry: TerrainParcelGeometry,
  features: readonly LandUseFeature[],
  samplesPerAxis: number,
): ParcelSurroundingsAnalysis["landUse"] {
  const bounds = parcelBounds(parcelGeometry);
  const width = bounds.east - bounds.west;
  const height = bounds.north - bounds.south;
  if (width <= 0 || height <= 0) {
    return {
      coveragePercent: 0,
      dominantClass: null,
      sampledPointCount: 0,
      classifiedPointCount: 0,
      sampleSpacingMeters: null,
      classes: [],
    };
  }

  const spacing = Math.max(width, height) / Math.max(4, samplesPerAxis);
  const columns = Math.max(1, Math.ceil(width / spacing));
  const rows = Math.max(1, Math.ceil(height / spacing));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const sortedFeatures = [...features].sort(
    (left, right) =>
      LAND_USE_PRIORITY[right.kind] - LAND_USE_PRIORITY[left.kind] ||
      left.id.localeCompare(right.id),
  );
  const counts = new Map<LandUseKind, number>();
  let sampledPointCount = 0;
  let classifiedPointCount = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point: TerrainPosition = [
        bounds.west + (column + 0.5) * cellWidth,
        bounds.south + (row + 0.5) * cellHeight,
      ];
      if (!isPointInParcel(point, parcelGeometry)) continue;
      sampledPointCount += 1;
      const matchingFeature = sortedFeatures.find((feature) =>
        isPointInPolygon(point, feature.geometry.coordinates),
      );
      if (!matchingFeature) continue;
      classifiedPointCount += 1;
      counts.set(matchingFeature.kind, (counts.get(matchingFeature.kind) ?? 0) + 1);
    }
  }

  const classes = [...counts.entries()]
    .map(([kind, sampledPoints]) => ({
      kind,
      areaPercent: sampledPointCount === 0 ? 0 : (sampledPoints / sampledPointCount) * 100,
      sampledPointCount: sampledPoints,
    }))
    .sort(
      (left, right) =>
        right.areaPercent - left.areaPercent ||
        LAND_USE_PRIORITY[right.kind] - LAND_USE_PRIORITY[left.kind],
    );

  return {
    coveragePercent: sampledPointCount === 0 ? 0 : (classifiedPointCount / sampledPointCount) * 100,
    dominantClass: classes[0]?.kind ?? null,
    sampledPointCount,
    classifiedPointCount,
    sampleSpacingMeters: Math.max(cellWidth, cellHeight),
    classes,
  };
}

export function analyzeParcelSurroundings(
  input: ParcelSurroundingsAnalysisInput,
): ParcelSurroundingsAnalysis {
  const searchRadiusMeters = Math.max(0, input.searchRadiusMeters);
  const maximumHydrologyObjects = Math.max(1, input.maximumHydrologyObjects ?? 12);
  const hydrologyObjects = input.hydrologyFeatures
    .map((feature) => ({
      ...feature,
      distanceMeters: geometryDistanceToParcel(feature.geometry, input.parcelGeometry),
    }))
    .filter(
      (feature) =>
        Number.isFinite(feature.distanceMeters) && feature.distanceMeters <= searchRadiusMeters,
    )
    .sort(
      (left, right) =>
        left.distanceMeters - right.distanceMeters ||
        (left.name ?? left.kind).localeCompare(right.name ?? right.kind) ||
        left.id.localeCompare(right.id),
    );

  return {
    hydrology: {
      searchRadiusMeters,
      objectCount: hydrologyObjects.length,
      nearestDistanceMeters: hydrologyObjects[0]?.distanceMeters ?? null,
      intersectsParcel: hydrologyObjects.some(({ distanceMeters }) => distanceMeters <= EPSILON),
      objects: hydrologyObjects.slice(0, maximumHydrologyObjects).map((feature) => ({
        id: feature.id,
        kind: feature.kind,
        name: feature.name,
        distanceMeters: feature.distanceMeters,
        relation:
          feature.distanceMeters <= EPSILON
            ? "intersects-parcel"
            : feature.distanceMeters <= 100
              ? "adjacent"
              : "nearby",
      })),
    },
    landUse: analyzeLandUse(
      input.parcelGeometry,
      input.landUseFeatures,
      input.landUseSamplesPerAxis ?? 40,
    ),
  };
}
