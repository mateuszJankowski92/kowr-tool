import {
  type Crop,
  type RecommendationContextRequest,
  type RecommendationResponse,
  RecommendationResponseSchema,
  type SoilProfileResponse,
  type TerrainContextResponse,
  type WaterAssessmentResponse,
} from "@kowr/contracts";
import { requestJson } from "./request-json";

export function createRecommendationContext(input: {
  crop: Crop;
  assessment: WaterAssessmentResponse | null;
  soil: SoilProfileResponse | null;
  terrain: TerrainContextResponse | null;
}): RecommendationContextRequest {
  const { soil, terrain } = input;
  const assessment = input.assessment?.completedSeason ?? input.assessment;
  const topMeterLayers = soil?.layers.filter(({ bottomDepthCm }) => bottomDepthCm <= 100) ?? [];
  const availableWaterCapacityMillimeters = topMeterLayers.reduce<number | null>(
    (total, layer) => {
      const value = layer.availableWaterCapacity.using33Kpa?.millimeters;
      return total === null || value === undefined ? null : total + value;
    },
    topMeterLayers.length > 0 ? 0 : null,
  );

  const completedPeriod =
    assessment?.evaluation?.scope === "completed-season" &&
    assessment.scenarios.completeCount > 0 &&
    assessment.scenarios.completeCount === assessment.scenarios.totalCount;
  const periodStress = assessment?.scenarios.stressDays;
  const periodClassification =
    periodStress && periodStress.minimum > 0
      ? ("elevated-shortage-risk" as const)
      : periodStress?.maximum === 0
        ? ("no-significant-shortage-indications" as const)
        : ("indeterminate" as const);
  return {
    crop: input.crop,
    cropPeriod:
      assessment?.evaluation?.scope === "completed-season"
        ? "completed-season"
        : assessment?.phenology?.status === "ready"
          ? "active-season"
          : "unknown",
    water: {
      status: completedPeriod
        ? periodClassification === "indeterminate"
          ? "indeterminate"
          : "complete"
        : (assessment?.status ?? "insufficient-data"),
      classification: completedPeriod
        ? periodClassification
        : (assessment?.balance.classification ?? null),
      maximumStressDays: assessment?.scenarios.stressDays?.maximum ?? null,
      maximumEvapotranspirationDeficitMm:
        assessment?.scenarios.cumulativeEvapotranspirationDeficitMm?.maximum ?? null,
    },
    soil: {
      status: soil?.status ?? "unavailable",
      topsoilOrganicCarbonGramsPerKilogram:
        soil?.layers[0].soilOrganicCarbonGramsPerKilogram.q50 ?? null,
      availableWaterCapacityMillimeters,
    },
    terrain: {
      ...(terrain?.terrain.status === "available" && terrain.terrain.inspectionPoints
        ? { inspectionPoints: terrain.terrain.inspectionPoints }
        : {}),
      status: terrain?.terrain.status ?? "unavailable",
      typicalSlopeDegrees:
        terrain?.terrain.status === "available"
          ? terrain.terrain.metrics.typicalSlopeDegrees
          : null,
      elevationRangeMeters:
        terrain?.terrain.status === "available"
          ? terrain.terrain.metrics.elevationRangeMeters
          : null,
    },
    hydrology: {
      ...(terrain?.surroundings.hydrology.status === "available"
        ? { objects: terrain.surroundings.hydrology.objects }
        : {}),
      status: terrain?.surroundings.hydrology.status ?? "unavailable",
      intersectsParcel:
        terrain?.surroundings.hydrology.status === "available"
          ? terrain.surroundings.hydrology.intersectsParcel
          : null,
      nearestDistanceMeters:
        terrain?.surroundings.hydrology.status === "available"
          ? terrain.surroundings.hydrology.nearestDistanceMeters
          : null,
    },
    landUse: {
      status: terrain?.surroundings.landUse.status ?? "unavailable",
      dominantClass:
        terrain?.surroundings.landUse.status === "available"
          ? terrain.surroundings.landUse.dominantClass
          : null,
      coveragePercent:
        terrain?.surroundings.landUse.status === "available"
          ? (terrain.surroundings.landUse.classes.find(({ kind }) => kind === "agriculture")
              ?.areaPercent ?? null)
          : null,
    },
    satellite: { consistency: assessment?.satellite.consistency ?? "unavailable" },
  };
}

export function getRecommendations(
  request: RecommendationContextRequest,
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  return requestJson("/api/recommendations", RecommendationResponseSchema, {
    method: "POST",
    body: request,
    signal,
  });
}
