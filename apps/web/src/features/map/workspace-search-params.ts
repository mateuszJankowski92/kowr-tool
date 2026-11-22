import { CropSchema, ParcelLookupQuerySchema, WeatherPeriodPresetSchema } from "@kowr/contracts";
import { containsCoordinate } from "ol/extent.js";
import { transform } from "ol/proj.js";
import {
  type AnalysisDateBounds,
  validateAnalysisDay,
  validateAnalysisRange,
} from "../analysis/analysis-date";
import { getValidAnalysisSelection } from "../analysis/analysis-search-params";
import { MAP_RESOLUTIONS, MAP_VIEW_EXTENT, POLISH_PROJECTION_CODE } from "./map-config";
import {
  hasMapViewSearchParameters,
  MAP_VIEW_SEARCH_PARAMETERS,
  parseMapViewFromSearchParams,
} from "./map-view-url";

const DATE_PARAMETERS = ["dateMode", "analysisDate", "dateFrom", "dateTo"] as const;
const KNOWN_PARAMETERS = new Set<string>([
  "parcel",
  "crop",
  "panel",
  "weatherPeriod",
  ...DATE_PARAMETERS,
  ...MAP_VIEW_SEARCH_PARAMETERS,
]);

export function validateWorkspaceSearchParams(
  searchParams: URLSearchParams,
  bounds: AnalysisDateBounds,
) {
  const invalidParameters = new Set<string>();
  const issues = new Set<string>();
  const reject = (parameters: readonly string[], message: string) => {
    for (const parameter of parameters) invalidParameters.add(parameter);
    issues.add(message);
  };

  for (const parameter of new Set(searchParams.keys())) {
    if (!KNOWN_PARAMETERS.has(parameter)) {
      reject([parameter], "The link contains unrecognized settings.");
    } else if (searchParams.getAll(parameter).length > 1) {
      reject([parameter], "Some settings occur more than once. Choose those values again.");
    }
  }

  const parcel = searchParams.get("parcel");
  if (parcel !== null && !ParcelLookupQuerySchema.safeParse({ identifier: parcel }).success) {
    reject(["parcel"], "Enter a parcel identifier containing between 1 and 80 characters.");
  }
  if (searchParams.has("crop") && !CropSchema.safeParse(searchParams.get("crop")).success) {
    reject(["crop"], "Choose a crop from the list.");
  }
  if (
    searchParams.has("weatherPeriod") &&
    !WeatherPeriodPresetSchema.safeParse(searchParams.get("weatherPeriod")).success
  ) {
    reject(["weatherPeriod"], "Choose an available weather period in the report.");
  }
  if (searchParams.has("panel") && searchParams.get("panel") !== "report") {
    reject(["panel"], "The requested view is unavailable.");
  }

  const mode = searchParams.get("dateMode");
  if (mode !== null && mode !== "day" && mode !== "range") {
    reject(DATE_PARAMETERS, "Choose a day or a date range for the analysis.");
  }
  for (const parameter of ["analysisDate", "dateFrom", "dateTo"]) {
    const value = searchParams.get(parameter);
    if (value !== null && !validateAnalysisDay(value, bounds).valid) {
      reject(
        DATE_PARAMETERS,
        "Choose valid analysis dates within the last ten years, up to today.",
      );
    }
  }
  if (mode === "range") {
    if (
      searchParams.has("analysisDate") ||
      !validateAnalysisRange(
        searchParams.get("dateFrom") ?? "",
        searchParams.get("dateTo") ?? "",
        bounds,
      ).valid
    ) {
      reject(DATE_PARAMETERS, "Choose a complete date range with its start on or before its end.");
    }
  } else if (searchParams.has("dateFrom") || searchParams.has("dateTo")) {
    reject(
      DATE_PARAMETERS,
      "The link mixes a single day with a date range. Choose the dates again.",
    );
  }
  if (DATE_PARAMETERS.some((parameter) => invalidParameters.has(parameter))) {
    for (const parameter of DATE_PARAMETERS) invalidParameters.add(parameter);
  }

  let mapView = parseMapViewFromSearchParams(searchParams, MAP_RESOLUTIONS.length - 1);
  if (
    mapView &&
    !containsCoordinate(
      MAP_VIEW_EXTENT,
      transform([mapView.longitude, mapView.latitude], "EPSG:4326", POLISH_PROJECTION_CODE),
    )
  ) {
    mapView = null;
  }
  if (hasMapViewSearchParameters(searchParams) && mapView === null) {
    reject(
      MAP_VIEW_SEARCH_PARAMETERS,
      "The saved map view is invalid. Choose a location on the map.",
    );
  }

  const parcelIdentifier =
    parcel === null || invalidParameters.has("parcel") ? null : parcel.trim();
  if (
    searchParams.get("panel") === "report" &&
    (parcelIdentifier === null || getValidAnalysisSelection(searchParams, bounds) === null)
  ) {
    reject(["panel"], "Choose a parcel, crop and valid analysis dates before opening the report.");
  }

  const repairedParams = new URLSearchParams(searchParams);
  for (const parameter of invalidParameters) repairedParams.delete(parameter);
  // Recovery returns to setup so discarding ambiguous input cannot start a different analysis.
  if (issues.size > 0) repairedParams.delete("panel");

  return { issues: [...issues], repairedParams, parcelIdentifier, mapView };
}
