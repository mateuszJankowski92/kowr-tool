export type TerrainPosition = readonly [easting: number, northing: number];
type TerrainRing = readonly TerrainPosition[];
type TerrainPolygon = readonly TerrainRing[];

export type TerrainParcelGeometry =
  | { type: "Polygon"; coordinates: TerrainPolygon }
  | { type: "MultiPolygon"; coordinates: readonly TerrainPolygon[] };

export type TerrainAnalysisInput = {
  columns: number;
  rows: number;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  heightsMeters: readonly (number | null)[];
  parcelGeometry: TerrainParcelGeometry;
};

export type TerrainAspect = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type TerrainMetrics = {
  minimumElevationMeters: number;
  maximumElevationMeters: number;
  elevationRangeMeters: number;
  typicalSlopeDegrees: number | null;
  steepSlopeP90Degrees: number | null;
  dominantAspect: TerrainAspect | null;
  sampledCellCount: number;
  slopeSampleCount: number;
};

const EPSILON = 1e-9;
const ASPECTS: TerrainAspect[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function isPointOnSegment(point: TerrainPosition, start: TerrainPosition, end: TerrainPosition) {
  const [x, y] = point;
  const [startX, startY] = start;
  const [endX, endY] = end;
  const squaredLength = (endX - startX) ** 2 + (endY - startY) ** 2;
  if (squaredLength <= EPSILON) {
    return (x - startX) ** 2 + (y - startY) ** 2 <= EPSILON;
  }
  const cross = (x - startX) * (endY - startY) - (y - startY) * (endX - startX);
  if (Math.abs(cross) > EPSILON) return false;

  const dot = (x - startX) * (endX - startX) + (y - startY) * (endY - startY);
  if (dot < -EPSILON) return false;
  return dot <= squaredLength + EPSILON;
}

function locatePointInRing(point: TerrainPosition, ring: TerrainRing) {
  let inside = false;
  const [x, y] = point;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!current || !next) continue;
    if (isPointOnSegment(point, current, next)) return "boundary" as const;

    const crossesY = current[1] > y !== next[1] > y;
    if (!crossesY) continue;
    const intersectionX =
      ((next[0] - current[0]) * (y - current[1])) / (next[1] - current[1]) + current[0];
    if (x < intersectionX) inside = !inside;
  }

  return inside ? ("inside" as const) : ("outside" as const);
}

function isInsidePolygon(point: TerrainPosition, polygon: TerrainPolygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer) return false;
  const outerLocation = locatePointInRing(point, outer);
  if (outerLocation === "outside") return false;
  return holes.every((hole) => locatePointInRing(point, hole) === "outside");
}

function isInsideGeometry(point: TerrainPosition, geometry: TerrainParcelGeometry): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => isInsidePolygon(point, polygon));
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) return null;
  return lower + (upper - lower) * (position - lowerIndex);
}

function toAspect(degrees: number): TerrainAspect {
  return ASPECTS[Math.round(degrees / 45) % ASPECTS.length] ?? "N";
}

export function calculateTerrainMetrics(input: TerrainAnalysisInput): TerrainMetrics | null {
  if (
    input.columns < 2 ||
    input.rows < 2 ||
    input.heightsMeters.length !== input.columns * input.rows
  ) {
    return null;
  }

  const cellWidth = (input.bounds.east - input.bounds.west) / input.columns;
  const cellHeight = (input.bounds.north - input.bounds.south) / input.rows;
  if (cellWidth <= 0 || cellHeight <= 0) return null;

  const isParcelCell: boolean[] = [];
  const parcelHeights: number[] = [];

  for (let row = 0; row < input.rows; row += 1) {
    const northing = input.bounds.north - (row + 0.5) * cellHeight;
    for (let column = 0; column < input.columns; column += 1) {
      const easting = input.bounds.west + (column + 0.5) * cellWidth;
      const index = row * input.columns + column;
      const inside = isInsideGeometry([easting, northing], input.parcelGeometry);
      isParcelCell[index] = inside;
      const height = input.heightsMeters[index];
      if (inside && height !== null && height !== undefined && Number.isFinite(height)) {
        parcelHeights.push(height);
      }
    }
  }

  if (parcelHeights.length === 0) return null;

  const slopes: number[] = [];
  const aspectCounts = new Map<TerrainAspect, number>(ASPECTS.map((aspect) => [aspect, 0]));

  for (let row = 1; row < input.rows - 1; row += 1) {
    for (let column = 1; column < input.columns - 1; column += 1) {
      const index = row * input.columns + column;
      if (!isParcelCell[index]) continue;

      const west = input.heightsMeters[index - 1];
      const east = input.heightsMeters[index + 1];
      const north = input.heightsMeters[index - input.columns];
      const south = input.heightsMeters[index + input.columns];
      if (
        west === null ||
        west === undefined ||
        east === null ||
        east === undefined ||
        north === null ||
        north === undefined ||
        south === null ||
        south === undefined
      ) {
        continue;
      }

      const dzDx = (east - west) / (2 * cellWidth);
      const dzDy = (north - south) / (2 * cellHeight);
      const slopeDegrees = (Math.atan(Math.hypot(dzDx, dzDy)) * 180) / Math.PI;
      slopes.push(slopeDegrees);

      if (slopeDegrees >= 0.5) {
        const downhillDegrees = ((Math.atan2(-dzDx, -dzDy) * 180) / Math.PI + 360) % 360;
        const aspect = toAspect(downhillDegrees);
        aspectCounts.set(aspect, (aspectCounts.get(aspect) ?? 0) + 1);
      }
    }
  }

  parcelHeights.sort((left, right) => left - right);
  slopes.sort((left, right) => left - right);
  const minimumElevationMeters = parcelHeights[0];
  const maximumElevationMeters = parcelHeights.at(-1);
  if (minimumElevationMeters === undefined || maximumElevationMeters === undefined) return null;

  const dominantAspectEntry = [...aspectCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];

  return {
    minimumElevationMeters,
    maximumElevationMeters,
    elevationRangeMeters: maximumElevationMeters - minimumElevationMeters,
    typicalSlopeDegrees: percentile(slopes, 0.5),
    steepSlopeP90Degrees: percentile(slopes, 0.9),
    dominantAspect:
      dominantAspectEntry && dominantAspectEntry[1] > 0 ? dominantAspectEntry[0] : null,
    sampledCellCount: parcelHeights.length,
    slopeSampleCount: slopes.length,
  };
}

export type TerrainInspectionCell = {
  id: string;
  kind: "low-terrain-cell" | "slope-cell";
  position: TerrainPosition;
  elevationMeters: number;
  cellSizeMeters: number;
};

/** Sampled places to inspect, never confirmed depressions, flow paths or construction sites. */
export function findTerrainInspectionCells(input: TerrainAnalysisInput): TerrainInspectionCell[] {
  if (!calculateTerrainMetrics(input)) return [];
  const width = (input.bounds.east - input.bounds.west) / input.columns;
  const height = (input.bounds.north - input.bounds.south) / input.rows;
  const cells = input.heightsMeters.flatMap((elevationMeters, index) => {
    if (elevationMeters === null || !Number.isFinite(elevationMeters)) return [];
    const column = index % input.columns;
    const row = Math.floor(index / input.columns);
    const position: TerrainPosition = [
      input.bounds.west + (column + 0.5) * width,
      input.bounds.north - (row + 0.5) * height,
    ];
    if (!isInsideGeometry(position, input.parcelGeometry)) return [];
    const neighbors = [index - 1, index + 1, index - input.columns, index + input.columns];
    const values = neighbors.map((neighbor) => input.heightsMeters[neighbor]);
    const slope =
      column > 0 &&
      column < input.columns - 1 &&
      row > 0 &&
      row < input.rows - 1 &&
      values.every((value) => value !== null && value !== undefined && Number.isFinite(value))
        ? Math.hypot(
            ((values[1] ?? 0) - (values[0] ?? 0)) / (2 * width),
            ((values[2] ?? 0) - (values[3] ?? 0)) / (2 * height),
          )
        : null;
    return [
      {
        id: `nmt-cell-${index}`,
        position,
        elevationMeters,
        slope,
        cellSizeMeters: Math.max(width, height),
      },
    ];
  });
  const low = [...cells].sort((a, b) => a.elevationMeters - b.elevationMeters)[0];
  const steep = cells
    .filter((cell) => cell.slope !== null && cell.slope > 0)
    .sort((a, b) => (b.slope ?? 0) - (a.slope ?? 0))[0];
  if (!low || cells.every((cell) => cell.elevationMeters === low.elevationMeters)) return [];
  return [
    { ...low, kind: "low-terrain-cell" as const },
    ...(steep ? [{ ...steep, kind: "slope-cell" as const }] : []),
  ];
}
