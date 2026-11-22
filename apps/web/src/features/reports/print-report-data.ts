import type {
  AnalysisDateSelection,
  Crop,
  SoilProfileResponse,
  TerrainContextResponse,
  WaterAssessmentResponse,
  WeatherPeriodPreset,
} from "@kowr/contracts";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { createRecommendationContext } from "../../api/recommendations";
import type { ReportPrintVariant } from "./report-print-context";

export type PrintReportSelection = {
  parcelIdentifier: string;
  crop: Crop;
  dateSelection: AnalysisDateSelection;
  weatherPreset: WeatherPeriodPreset;
};

export function getPrintQueryKeys(
  client: QueryClient,
  selection: PrintReportSelection,
  variant: ReportPrintVariant,
  geometry: unknown,
): QueryKey[] {
  const { parcelIdentifier, crop, dateSelection, weatherPreset } = selection;
  const analysisDate = dateSelection.type === "day" ? dateSelection.date : dateSelection.endDate;
  const assessmentKey = ["water-assessment", parcelIdentifier, crop, analysisDate, undefined];
  const soilKey = ["soil-profile", parcelIdentifier];
  const terrainKey = ["terrain-context", parcelIdentifier];
  const context = createRecommendationContext({
    crop,
    assessment: client.getQueryData<WaterAssessmentResponse>(assessmentKey) ?? null,
    soil: client.getQueryData<SoilProfileResponse>(soilKey) ?? null,
    terrain: client.getQueryData<TerrainContextResponse>(terrainKey) ?? null,
  });
  return [
    assessmentKey,
    soilKey,
    terrainKey,
    ["historical-water-assessment", parcelIdentifier, crop, analysisDate, undefined],
    ["recommendations", context],
    ["weather-conditions", parcelIdentifier, crop, dateSelection, weatherPreset],
    ...(variant === "extended"
      ? [["satellite-observation-summary", parcelIdentifier, geometry, analysisDate]]
      : []),
  ];
}

export function arePrintQueriesReady(client: QueryClient, keys: QueryKey[]): boolean {
  // A failed independent source is a settled result, and is printed as unavailable.
  // Disabled placeholder recommendation queries must never count as ready.
  const sourceDataReady = keys.every((key) => {
    const state = client.getQueryState(key);
    return state !== undefined && state.status !== "pending" && state.fetchStatus === "idle";
  });
  const backgroundsReady = client
    .getQueryCache()
    .findAll({
      queryKey: ["print-map-background"],
      type: "active",
    })
    .every(({ state }) => state.status !== "pending" && state.fetchStatus === "idle");
  return sourceDataReady && backgroundsReady;
}
