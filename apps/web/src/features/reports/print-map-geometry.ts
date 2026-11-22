import type { ParcelResponse, RecommendationItem } from "@kowr/contracts";
import { extend, getCenter, getIntersection } from "ol/extent.js";
import GeoJSON from "ol/format/GeoJSON.js";
import type Geometry from "ol/geom/Geometry.js";
import LineString from "ol/geom/LineString.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import Polygon from "ol/geom/Polygon.js";
import { POLISH_PROJECTION_CODE } from "../map/map-config";
import {
  createHydrologyMapFeatures,
  type HydrologyData,
} from "../terrain-context/hydrology-map-features";
import { layoutHydrologyMarkers } from "../terrain-context/hydrology-marker-layout";

export const PRINT_MAP_SIZE = [600, 260] as const;
const padding = 28;

export function createPrintMapLayout({
  parcel,
  locations = [],
  hydrology = null,
}: {
  parcel: Pick<ParcelResponse, "geometry">;
  locations?: RecommendationItem["locations"];
  hydrology?: Pick<HydrologyData, "objects" | "searchRadiusMeters"> | null;
}) {
  const format = new GeoJSON({
    dataProjection: "EPSG:4326",
    featureProjection: POLISH_PROJECTION_CODE,
  });
  const map = createHydrologyMapFeatures(
    parcel,
    hydrology ?? { objects: [], searchRadiusMeters: 1_000 },
  );
  const parcelGeometry = map.parcelFeature.getGeometry();
  if (!parcelGeometry) throw new Error("Parcel geometry is missing.");
  const center = getCenter(parcelGeometry.getExtent());
  const inspectionFeatures = locations.map((location, index) => {
    const geometry = format.readGeometry(location.geometry);
    if (!geometry) throw new Error("Inspection geometry is missing.");
    return {
      key: `${location.kind}:${location.id}`,
      number: index + 1,
      label: location.name ?? `Miejsce do oględzin ${index + 1}`,
      geometry,
    };
  });
  const extent = map.fitExtent(null);
  for (const feature of inspectionFeatures) {
    // Keep long source geometries within the same local context as the screen map.
    extend(extent, getIntersection(feature.geometry.getExtent(), map.searchExtent));
  }
  const [width, height] = PRINT_MAP_SIZE;
  const scale = Math.min(
    (width - 2 * padding) / Math.max((extent[2] ?? 0) - (extent[0] ?? 0), 1),
    (height - 2 * padding) / Math.max((extent[3] ?? 0) - (extent[1] ?? 0), 1),
  );
  const [centerX = 0, centerY = 0] = getCenter(extent);
  const project = ([x = 0, y = 0]: number[]): [number, number] => [
    width / 2 + (x - centerX) * scale,
    height / 2 - (y - centerY) * scale,
  ];
  const linePath = (coordinates: number[][]) =>
    coordinates
      .map((point, index) => `${index === 0 ? "M" : "L"}${project(point).join(",")}`)
      .join(" ");
  const path = (geometry: Geometry): string => {
    if (geometry instanceof LineString) return linePath(geometry.getCoordinates());
    if (geometry instanceof Polygon) {
      return geometry
        .getCoordinates()
        .map((ring) => `${linePath(ring)} Z`)
        .join(" ");
    }
    if (geometry instanceof MultiPolygon) return geometry.getPolygons().map(path).join(" ");
    return "";
  };
  const water = map.waterFeatures.flatMap((feature, index) => {
    const geometry = feature.getGeometry();
    if (!geometry) return [];
    return [
      {
        key: `water:${feature.getId()}`,
        number: index + 1,
        label: hydrology?.objects[index]?.name ?? `Obiekt wodny ${index + 1}`,
        geometry,
      },
    ];
  });
  const sourceFeatures = [...water, ...inspectionFeatures];
  // The first vertex of a long river can be kilometres away. Anchor its label at
  // the nearest point of the actual source geometry, just as on the screen map.
  const anchors = sourceFeatures.map(({ geometry }) => project(geometry.getClosestPoint(center)));
  const positions = layoutHydrologyMarkers(anchors, [width, height]);
  const markers = sourceFeatures.map((feature, index) => ({
    key: feature.key,
    number: feature.number,
    label: feature.label,
    anchor: anchors[index] ?? [0, 0],
    position: positions[index] ?? anchors[index] ?? [0, 0],
  }));
  return {
    backgroundExtent: [
      centerX - width / (2 * scale),
      centerY - height / (2 * scale),
      centerX + width / (2 * scale),
      centerY + height / (2 * scale),
    ],
    parcelPath: path(parcelGeometry),
    water: water.map((feature) => ({
      key: feature.key,
      path: path(feature.geometry),
      polygon: feature.geometry instanceof Polygon,
    })),
    inspections: inspectionFeatures.map((feature) => ({
      key: feature.key,
      path: path(feature.geometry),
      polygon: feature.geometry instanceof Polygon,
    })),
    markers,
  };
}
