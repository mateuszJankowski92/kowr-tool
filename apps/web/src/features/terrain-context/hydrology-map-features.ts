import type { ParcelResponse, TerrainContextResponse } from "@kowr/contracts";
import { buffer, extend, getIntersection } from "ol/extent.js";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import { POLISH_PROJECTION_CODE } from "../map/map-config";

export type HydrologyData = Extract<
  TerrainContextResponse["surroundings"]["hydrology"],
  { status: "available" }
>;

export function createHydrologyMapFeatures(
  parcel: Pick<ParcelResponse, "geometry">,
  hydrology: Pick<HydrologyData, "objects" | "searchRadiusMeters">,
) {
  const format = new GeoJSON({
    dataProjection: "EPSG:4326",
    featureProjection: POLISH_PROJECTION_CODE,
  });
  const parcelGeometry = format.readGeometry(parcel.geometry);
  if (!parcelGeometry) throw new Error("Parcel geometry is missing.");
  const parcelFeature = new Feature({ geometry: parcelGeometry, parcel: true });
  const parcelExtent = parcelGeometry.getExtent();
  const searchExtent = buffer(parcelExtent, hydrology.searchRadiusMeters);
  const waterFeatures = hydrology.objects.slice(0, 4).map((object, index) => {
    const geometry = format.readGeometry(object.geometry);
    if (!geometry) throw new Error("Water geometry is missing.");
    const feature = new Feature({
      geometry,
      number: index + 1,
    });
    feature.setId(object.id);
    return feature;
  });

  function fitExtent(selectedId: string | null) {
    const extent = [...parcelExtent];
    for (const feature of waterFeatures) {
      if (selectedId !== null && feature.getId() !== selectedId) continue;
      const geometryExtent = feature.getGeometry()?.getExtent();
      // Long rivers may extend far beyond the local search area.
      if (geometryExtent) extend(extent, getIntersection(geometryExtent, searchExtent));
    }
    return extent;
  }

  return { parcelFeature, waterFeatures, searchExtent, fitExtent };
}
