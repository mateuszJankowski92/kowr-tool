import { containsCoordinate } from "ol/extent.js";
import TileLayer from "ol/layer/Tile.js";
import { register } from "ol/proj/proj4.js";
import { get as getProjection, transformExtent } from "ol/proj.js";
import WMTS from "ol/source/WMTS.js";
import WMTSTileGrid from "ol/tilegrid/WMTS.js";
import proj4 from "proj4";

export const POLISH_PROJECTION_CODE = "EPSG:2180";

const POLISH_PROJECTION_DEFINITION =
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 " +
  "+ellps=GRS80 +units=m +no_defs +type=crs";

const POLAND_GEOGRAPHIC_EXTENT = [14.07, 49, 24.15, 54.84];
const MAP_VIEW_GEOGRAPHIC_EXTENT = [12.8, 48.2, 25.8, 55.6];
const WMTS_ORIGIN: [number, number] = [100_000, 850_000];
const OGC_PIXEL_SIZE_METERS = 0.00028;

const SCALE_DENOMINATORS = [
  7_559_538.928571429, 3_779_769.4642857146, 1_889_884.7321428573, 944_942.3660714286,
  472_471.1830357143, 236_235.59151785716, 94_494.23660714286, 47_247.11830357143,
  23_623.559151785714, 9_449.423660714287, 4_724.711830357143, 1_889.8847321428573,
  944.9423660714286,
];

const TOPOGRAPHIC_MATRIX_IDS = SCALE_DENOMINATORS.map(
  (_, index) => `${POLISH_PROJECTION_CODE}:${index}`,
);

const ORTHOPHOTO_MATRIX_IDS = SCALE_DENOMINATORS.map(
  (_, index) => `${POLISH_PROJECTION_CODE}:${index + 2}`,
);

const TOPOGRAPHIC_MATRIX_SIZES: [number, number][] = [
  [6, 15],
  [12, 30],
  [23, 60],
  [45, 120],
  [89, 239],
  [178, 477],
  [445, 1_192],
  [889, 2_384],
  [1_778, 4_768],
  [4_444, 11_919],
  [8_887, 23_837],
  [22_217, 59_591],
  [44_433, 119_181],
];

const ORTHOPHOTO_MATRIX_SIZES: [number, number][] = [
  [1, 1],
  [2, 2],
  [3, 3],
  [6, 6],
  [12, 11],
  [23, 22],
  [57, 54],
  [114, 107],
  [227, 214],
  [567, 533],
  [1_133, 1_066],
  [2_831, 2_664],
  [5_662, 5_328],
];

export const MAP_RESOLUTIONS = SCALE_DENOMINATORS.map(
  (scaleDenominator) => scaleDenominator * OGC_PIXEL_SIZE_METERS,
);
export const MIN_PARCEL_SELECTION_ZOOM = 9;

export function isParcelSelectionZoom(zoom: number | undefined): boolean {
  return zoom !== undefined && zoom >= MIN_PARCEL_SELECTION_ZOOM;
}

proj4.defs(POLISH_PROJECTION_CODE, POLISH_PROJECTION_DEFINITION);
register(proj4);

const polishProjection = getProjection(POLISH_PROJECTION_CODE);

if (!polishProjection) {
  throw new Error(`Projection ${POLISH_PROJECTION_CODE} could not be registered.`);
}

export const POLISH_PROJECTION = polishProjection;

export const POLAND_EXTENT = transformExtent(
  POLAND_GEOGRAPHIC_EXTENT,
  "EPSG:4326",
  POLISH_PROJECTION_CODE,
  8,
);

export function isCoordinateInPolandMapExtent(coordinate: number[]): boolean {
  return containsCoordinate(POLAND_EXTENT, coordinate);
}

export function canSelectParcelAtMapPosition(
  zoom: number | undefined,
  coordinate: number[],
): boolean {
  return isParcelSelectionZoom(zoom) && isCoordinateInPolandMapExtent(coordinate);
}

export const MAP_VIEW_EXTENT = transformExtent(
  MAP_VIEW_GEOGRAPHIC_EXTENT,
  "EPSG:4326",
  POLISH_PROJECTION_CODE,
  8,
);

POLISH_PROJECTION.setExtent(MAP_VIEW_EXTENT);

const topographicTileGrid = new WMTSTileGrid({
  matrixIds: TOPOGRAPHIC_MATRIX_IDS,
  origin: WMTS_ORIGIN,
  resolutions: MAP_RESOLUTIONS,
  sizes: TOPOGRAPHIC_MATRIX_SIZES,
  tileSize: 512,
});

const orthophotoTileGrid = new WMTSTileGrid({
  matrixIds: ORTHOPHOTO_MATRIX_IDS,
  origin: WMTS_ORIGIN,
  resolutions: MAP_RESOLUTIONS,
  sizes: ORTHOPHOTO_MATRIX_SIZES,
  tileSize: 512,
});

export function createTopographicLayer(): TileLayer<WMTS> {
  return new TileLayer({
    // The service can return an empty HTTP 200 image for tiles outside its Polish coverage.
    extent: POLAND_EXTENT,
    source: new WMTS({
      attributions: "GUGiK — Mapa podkładowa BDOO i BDOT10k",
      format: "image/png",
      layer: "BDOT10k",
      matrixSet: POLISH_PROJECTION_CODE,
      projection: POLISH_PROJECTION,
      requestEncoding: "KVP",
      style: "default",
      tileGrid: topographicTileGrid,
      url: "https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/BDOT10k-BDOO",
      wrapX: false,
    }),
  });
}

export function createOrthophotoLayer(): TileLayer<WMTS> {
  return new TileLayer({
    extent: POLAND_EXTENT,
    source: new WMTS({
      attributions: "GUGiK — Ortofotomapa standardowa",
      format: "image/jpeg",
      layer: "ORTOFOTOMAPA",
      matrixSet: POLISH_PROJECTION_CODE,
      projection: POLISH_PROJECTION,
      requestEncoding: "KVP",
      style: "default",
      tileGrid: orthophotoTileGrid,
      url: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution",
      wrapX: false,
    }),
    visible: false,
  });
}

export const MAP_MATRIX_IDS = {
  orthophoto: ORTHOPHOTO_MATRIX_IDS,
  topographic: TOPOGRAPHIC_MATRIX_IDS,
} as const;
