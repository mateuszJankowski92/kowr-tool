import { findCropWaterProfile, findCropWaterProfileIdForArimrCrop } from "./crop-water-profiles.js";
import type {
  Fao56BalanceClassification,
  SatelliteConsistency,
} from "./water-situation-assessment.js";

export type RecommendationId =
  | "protect-soil-surface"
  | "manage-perennial-cover"
  | "build-soil-organic-matter"
  | "review-contour-practices"
  | "inspect-nearby-water-network"
  | "survey-distributed-retention"
  | "verify-field-conditions"
  | "maintain-water-conservation-practices";

export type RecommendationEvidenceCode =
  | "modelled-water-stress"
  | "no-modelled-water-stress"
  | "scenario-disagreement"
  | "agricultural-land-use"
  | "terrain-relief"
  | "nearby-water-object"
  | "water-object-on-parcel"
  | "modelled-soil-profile"
  | "satellite-conflict"
  | "incomplete-inputs"
  | "crop-root-depth";

export type RecommendationMissingInput =
  | "current-field-soil-moisture"
  | "confirmed-crop-growth-stage"
  | "field-management-history"
  | "detailed-runoff-survey"
  | "drainage-ownership-and-condition"
  | "legal-and-environmental-constraints";

export type RecommendationVerification =
  | "field-inspection"
  | "agronomist-review"
  | "survey-and-design"
  | "formal-and-legal-check";

export type RecommendationLocation = {
  id: string;
  kind: "water-object" | "low-terrain-cell" | "slope-cell";
  name: string | null;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] };
  source: "GUGiK NMT" | "OpenStreetMap";
  resolutionMeters: number | null;
  distanceMeters: number | null;
};

export type RecommendationInput = {
  crop: { id: string; period: "active-season" | "completed-season" | "unknown" };
  water: {
    status: "complete" | "indeterminate" | "insufficient-data";
    classification: Fao56BalanceClassification | null;
    maximumStressDays: number | null;
    maximumEvapotranspirationDeficitMm: number | null;
  };
  soil: {
    status: "complete" | "partial" | "no-data" | "unavailable";
    topsoilOrganicCarbonGramsPerKilogram: number | null;
    availableWaterCapacityMillimeters: number | null;
  };
  terrain: {
    status: "available" | "unavailable";
    typicalSlopeDegrees: number | null;
    elevationRangeMeters: number | null;
    inspectionPoints?: Array<{
      id: string;
      kind: "low-terrain-cell" | "slope-cell";
      coordinates: [number, number];
      elevationMeters: number;
      cellSizeMeters: number;
    }>;
  };
  hydrology: {
    status: "available" | "unavailable";
    intersectsParcel: boolean | null;
    nearestDistanceMeters: number | null;
    objects?: Array<{
      id: string;
      name: string | null;
      distanceMeters: number;
      geometry: Exclude<RecommendationLocation["geometry"], { type: "Point" }>;
    }>;
  };
  landUse: {
    status: "available" | "unavailable";
    dominantClass: string | null;
    coveragePercent: number | null;
  };
  satellite: {
    consistency: SatelliteConsistency;
  };
};

export type RecommendationAction = {
  id: RecommendationId;
  category: "retention" | "agronomic";
  priority: "high" | "medium" | "low";
  evidence: Array<{
    code: RecommendationEvidenceCode;
    value: number | null;
    unit: "days" | "millimeters" | "degrees" | "meters" | "percent" | null;
  }>;
  missingInputs: RecommendationMissingInput[];
  verification: RecommendationVerification[];
};

export type CropPractice =
  | "annual-standing"
  | "annual-post-season"
  | "perennial-interrows"
  | "perennial-sward"
  | "unknown";

export type ParcelRecommendation = RecommendationAction & {
  cropPractice: CropPractice;
  locations: RecommendationLocation[];
};

export type RecommendationResult = {
  status: "complete" | "partial" | "unavailable";
  items: ParcelRecommendation[];
};

const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 } as const;

function evidence(
  code: RecommendationEvidenceCode,
  value: number | null = null,
  unit: ParcelRecommendation["evidence"][number]["unit"] = null,
) {
  return { code, value, unit };
}

function pushUnique(items: RecommendationAction[], item: RecommendationAction): void {
  if (!items.some(({ id }) => id === item.id)) items.push(item);
}

export function generateParcelRecommendations(input: RecommendationInput): RecommendationResult {
  const items: RecommendationAction[] = [];
  const profileId = findCropWaterProfileIdForArimrCrop(input.crop.id);
  const profile = profileId ? findCropWaterProfile(profileId) : null;
  const rowPerennial =
    profileId !== null &&
    ["pome-orchard", "stone-orchard", "grape", "hops", "berry", "strawberry"].includes(profileId);
  const cropPractice: CropPractice =
    !profile || input.crop.period === "unknown"
      ? "unknown"
      : profile.seasonType === "perennial"
        ? rowPerennial
          ? "perennial-interrows"
          : "perennial-sward"
        : input.crop.period === "completed-season"
          ? "annual-post-season"
          : "annual-standing";
  const classification = input.water.classification;
  const showsStress =
    classification === "elevated-shortage-risk" || classification === "strong-shortage-indications";
  const noStress = classification === "no-significant-shortage-indications";
  const uncertain =
    input.water.status !== "complete" ||
    classification === "indeterminate" ||
    classification === "insufficient-data";
  const agricultural =
    input.landUse.status === "available" && input.landUse.dominantClass === "agriculture";

  if (agricultural && showsStress && cropPractice !== "unknown") {
    pushUnique(items, {
      id: profile?.seasonType === "perennial" ? "manage-perennial-cover" : "protect-soil-surface",
      category: "agronomic",
      priority: "high",
      evidence: [
        evidence("modelled-water-stress", input.water.maximumStressDays, "days"),
        evidence("crop-root-depth", profile?.maximumRootDepthMeters.minimum ?? null, "meters"),
        evidence("agricultural-land-use", input.landUse.coveragePercent, "percent"),
      ],
      missingInputs: ["field-management-history", "confirmed-crop-growth-stage"],
      verification: ["field-inspection", "agronomist-review"],
    });
    if (input.soil.status === "complete" || input.soil.status === "partial") {
      pushUnique(items, {
        id: "build-soil-organic-matter",
        category: "agronomic",
        priority: "medium",
        evidence: [
          evidence(
            "modelled-soil-profile",
            input.soil.availableWaterCapacityMillimeters,
            "millimeters",
          ),
          evidence(
            "modelled-water-stress",
            input.water.maximumEvapotranspirationDeficitMm,
            "millimeters",
          ),
        ],
        missingInputs: ["field-management-history"],
        verification: ["agronomist-review"],
      });
    }
  } else if (agricultural && noStress && cropPractice !== "unknown") {
    pushUnique(items, {
      id: "maintain-water-conservation-practices",
      category: "agronomic",
      priority: "low",
      evidence: [
        evidence("no-modelled-water-stress"),
        evidence("agricultural-land-use", input.landUse.coveragePercent, "percent"),
      ],
      missingInputs: ["field-management-history"],
      verification: ["field-inspection"],
    });
  }

  const hasRelevantRelief =
    input.terrain.status === "available" &&
    ((input.terrain.typicalSlopeDegrees ?? 0) >= 1 ||
      (input.terrain.elevationRangeMeters ?? 0) >= 2);
  if (agricultural && hasRelevantRelief) {
    pushUnique(items, {
      id: "review-contour-practices",
      category: "retention",
      priority: showsStress ? "high" : "medium",
      evidence: [
        ...((input.terrain.typicalSlopeDegrees ?? 0) >= 1
          ? [evidence("terrain-relief", input.terrain.typicalSlopeDegrees, "degrees")]
          : []),
        ...((input.terrain.elevationRangeMeters ?? 0) >= 2
          ? [evidence("terrain-relief", input.terrain.elevationRangeMeters, "meters")]
          : []),
        evidence("agricultural-land-use", input.landUse.coveragePercent, "percent"),
      ],
      missingInputs: ["detailed-runoff-survey", "field-management-history"],
      verification: ["field-inspection", "agronomist-review"],
    });
  }

  const waterIntersects =
    input.hydrology.status === "available" && input.hydrology.intersectsParcel === true;
  const waterAdjacent =
    input.hydrology.status === "available" &&
    input.hydrology.nearestDistanceMeters !== null &&
    input.hydrology.nearestDistanceMeters <= 100;
  if (waterIntersects || waterAdjacent) {
    pushUnique(items, {
      id: "inspect-nearby-water-network",
      category: "retention",
      priority: waterIntersects ? "high" : "medium",
      evidence: [
        waterIntersects
          ? evidence("water-object-on-parcel", 0, "meters")
          : evidence("nearby-water-object", input.hydrology.nearestDistanceMeters, "meters"),
      ],
      missingInputs: ["drainage-ownership-and-condition", "legal-and-environmental-constraints"],
      verification: ["field-inspection", "formal-and-legal-check"],
    });
  }

  if (showsStress && input.terrain.status === "available") {
    pushUnique(items, {
      id: "survey-distributed-retention",
      category: "retention",
      priority: "medium",
      evidence: [
        evidence("modelled-water-stress", input.water.maximumStressDays, "days"),
        evidence("terrain-relief", input.terrain.elevationRangeMeters, "meters"),
      ],
      missingInputs: ["detailed-runoff-survey", "legal-and-environmental-constraints"],
      verification: ["survey-and-design", "formal-and-legal-check"],
    });
  }

  const missingSpatialContext =
    input.soil.status !== "complete" ||
    input.terrain.status !== "available" ||
    input.hydrology.status !== "available" ||
    input.landUse.status !== "available" ||
    input.landUse.dominantClass === null;
  if (
    uncertain ||
    cropPractice === "unknown" ||
    missingSpatialContext ||
    input.satellite.consistency === "conflicts-with-balance"
  ) {
    pushUnique(items, {
      id: "verify-field-conditions",
      category: "agronomic",
      priority:
        classification === "indeterminate" ||
        input.satellite.consistency === "conflicts-with-balance"
          ? "high"
          : "medium",
      evidence: [
        classification === "indeterminate"
          ? evidence("scenario-disagreement")
          : input.satellite.consistency === "conflicts-with-balance"
            ? evidence("satellite-conflict")
            : evidence("incomplete-inputs"),
      ],
      missingInputs: ["current-field-soil-moisture", "confirmed-crop-growth-stage"],
      verification: ["field-inspection"],
    });
  }

  const allCoreContextUnavailable =
    input.water.status === "insufficient-data" &&
    input.soil.status === "unavailable" &&
    input.terrain.status === "unavailable" &&
    input.hydrology.status === "unavailable" &&
    input.landUse.status === "unavailable";
  const completeContext =
    input.water.status === "complete" &&
    cropPractice !== "unknown" &&
    input.soil.status === "complete" &&
    input.terrain.status === "available" &&
    input.hydrology.status === "available" &&
    input.landUse.status === "available" &&
    input.landUse.dominantClass !== null;

  const selectedItems = items
    .sort(
      (left, right) =>
        PRIORITY_ORDER[right.priority] - PRIORITY_ORDER[left.priority] ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 4)
    .map(
      (item): ParcelRecommendation => ({
        ...item,
        cropPractice,
        locations: recommendationLocations(item.id, input),
      }),
    );
  const missingLocation = selectedItems.some(
    (item) => item.category === "retention" && item.locations.length === 0,
  );
  return {
    status: allCoreContextUnavailable
      ? "unavailable"
      : completeContext && !missingLocation
        ? "complete"
        : "partial",
    items: selectedItems,
  };
}

function recommendationLocations(
  id: RecommendationId,
  input: RecommendationInput,
): RecommendationLocation[] {
  if (id === "inspect-nearby-water-network" && input.hydrology.status === "available") {
    return (input.hydrology.objects ?? [])
      .filter((object) => object.distanceMeters <= 100)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map((object) => ({
        id: object.id,
        kind: "water-object",
        name: object.name,
        geometry: object.geometry,
        source: "OpenStreetMap",
        resolutionMeters: null,
        distanceMeters: object.distanceMeters,
      }));
  }
  const kind =
    id === "review-contour-practices"
      ? "slope-cell"
      : id === "survey-distributed-retention"
        ? "low-terrain-cell"
        : null;
  if (!kind || input.terrain.status !== "available") return [];
  return (input.terrain.inspectionPoints ?? [])
    .filter((point) => point.kind === kind)
    .map((point) => ({
      id: point.id,
      kind: point.kind,
      name: null,
      geometry: { type: "Point", coordinates: point.coordinates },
      source: "GUGiK NMT",
      resolutionMeters: point.cellSizeMeters,
      distanceMeters: 0,
    }));
}
