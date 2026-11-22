import type { ParcelGeometry, ProjectedParcelGeometry, TerrainBounds } from "@kowr/contracts";
import proj4 from "proj4";

const EPSG_2180_DEFINITION =
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 " +
  "+ellps=GRS80 +units=m +no_defs";
const MAX_GRID_SIZE = 128;
const MIN_BUFFER_METERS = 75;
const MAX_BUFFER_METERS = 350;
const BUFFER_TO_PARCEL_RATIO = 0.35;
const MIN_TERRAIN_ASPECT_RATIO = 2;

proj4.defs("EPSG:2180", EPSG_2180_DEFINITION);

export function projectWgs84Position(position: [number, number]): [number, number] {
  const projected = proj4("EPSG:4326", "EPSG:2180", position);
  return [projected[0], projected[1]];
}

export function unprojectTerrainPosition(position: readonly [number, number]): [number, number] {
  const geographic = proj4("EPSG:2180", "EPSG:4326", [position[0], position[1]] as [
    number,
    number,
  ]);
  return [geographic[0], geographic[1]];
}

export function projectParcelGeometry(geometry: ParcelGeometry): ProjectedParcelGeometry {
  const projectRing = (ring: [number, number][]) => ring.map(projectWgs84Position);
  const projectPolygon = (polygon: [number, number][][]) => polygon.map(projectRing);

  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: geometry.coordinates.map(projectRing) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map(projectPolygon) };
}

function positions(geometry: ProjectedParcelGeometry): [number, number][] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flat(2);
}

export function createTerrainRequest(geometry: ProjectedParcelGeometry): {
  bounds: TerrainBounds;
  columns: number;
  rows: number;
} {
  const allPositions = positions(geometry);
  const eastings = allPositions.map(([easting]) => easting);
  const northings = allPositions.map(([, northing]) => northing);
  const parcelWest = Math.min(...eastings);
  const parcelEast = Math.max(...eastings);
  const parcelSouth = Math.min(...northings);
  const parcelNorth = Math.max(...northings);
  const parcelWidth = parcelEast - parcelWest;
  const parcelHeight = parcelNorth - parcelSouth;

  const bufferMeters = Math.min(
    MAX_BUFFER_METERS,
    Math.max(MIN_BUFFER_METERS, Math.max(parcelWidth, parcelHeight) * BUFFER_TO_PARCEL_RATIO),
  );
  const bufferedBounds = {
    west: parcelWest - bufferMeters,
    south: parcelSouth - bufferMeters,
    east: parcelEast + bufferMeters,
    north: parcelNorth + bufferMeters,
  };
  const bufferedWidth = bufferedBounds.east - bufferedBounds.west;
  const bufferedHeight = bufferedBounds.north - bufferedBounds.south;
  const expandedLandscapeWidth = Math.max(bufferedWidth, bufferedHeight * MIN_TERRAIN_ASPECT_RATIO);
  const horizontalExpansion = (expandedLandscapeWidth - bufferedWidth) / 2;
  const unsnappedBounds = {
    ...bufferedBounds,
    west: bufferedBounds.west - horizontalExpansion,
    east: bufferedBounds.east + horizontalExpansion,
  };
  const width = unsnappedBounds.east - unsnappedBounds.west;
  const height = unsnappedBounds.north - unsnappedBounds.south;
  const cellSizeMeters = Math.max(1, Math.max(width, height) / MAX_GRID_SIZE);
  const columns = Math.max(2, Math.ceil(width / cellSizeMeters));
  const rows = Math.max(2, Math.ceil(height / cellSizeMeters));
  const expandedWidth = columns * cellSizeMeters;
  const expandedHeight = rows * cellSizeMeters;
  const centerEasting = (unsnappedBounds.west + unsnappedBounds.east) / 2;
  const centerNorthing = (unsnappedBounds.south + unsnappedBounds.north) / 2;

  return {
    bounds: {
      west: centerEasting - expandedWidth / 2,
      east: centerEasting + expandedWidth / 2,
      south: centerNorthing - expandedHeight / 2,
      north: centerNorthing + expandedHeight / 2,
    },
    columns,
    rows,
  };
}

export function createTextureSize(bounds: TerrainBounds): { width: number; height: number } {
  const widthMeters = bounds.east - bounds.west;
  const heightMeters = bounds.north - bounds.south;
  const maxPixels = 1_400;

  if (widthMeters >= heightMeters) {
    return {
      width: maxPixels,
      height: Math.max(320, Math.round((maxPixels * heightMeters) / widthMeters)),
    };
  }

  return {
    width: Math.max(320, Math.round((maxPixels * widthMeters) / heightMeters)),
    height: maxPixels,
  };
}
