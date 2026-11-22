export const MAP_VIEW_SEARCH_PARAMETERS = ["mapLat", "mapLon", "mapZoom"] as const;

export type MapUrlView = {
  latitude: number;
  longitude: number;
  zoom: number;
};

const COORDINATE_DECIMAL_PLACES = 5;
const ZOOM_DECIMAL_PLACES = 2;

function parseFiniteNumber(value: string | null): number | null {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasMapViewSearchParameters(searchParams: URLSearchParams): boolean {
  return MAP_VIEW_SEARCH_PARAMETERS.some((parameter) => searchParams.has(parameter));
}

export function parseMapViewFromSearchParams(
  searchParams: URLSearchParams,
  maximumZoom: number,
): MapUrlView | null {
  if (MAP_VIEW_SEARCH_PARAMETERS.some((parameter) => searchParams.getAll(parameter).length !== 1)) {
    return null;
  }

  const latitude = parseFiniteNumber(searchParams.get("mapLat"));
  const longitude = parseFiniteNumber(searchParams.get("mapLon"));
  const zoom = parseFiniteNumber(searchParams.get("mapZoom"));

  if (
    latitude === null ||
    longitude === null ||
    zoom === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    zoom < 0 ||
    zoom > maximumZoom
  ) {
    return null;
  }

  return { latitude, longitude, zoom };
}

export function setMapViewSearchParameters(
  searchParams: URLSearchParams,
  mapView: MapUrlView,
): void {
  searchParams.set("mapLat", mapView.latitude.toFixed(COORDINATE_DECIMAL_PLACES));
  searchParams.set("mapLon", mapView.longitude.toFixed(COORDINATE_DECIMAL_PLACES));
  searchParams.set("mapZoom", String(Number(mapView.zoom.toFixed(ZOOM_DECIMAL_PLACES))));
}

export function deleteMapViewSearchParameters(searchParams: URLSearchParams): void {
  for (const parameter of MAP_VIEW_SEARCH_PARAMETERS) searchParams.delete(parameter);
}
