import {
  ADDITIONAL_ARIMR_PROFILE_GROUPS,
  ADDITIONAL_CROP_WATER_PROFILES,
} from "./additional-crop-water-profiles.js";
import { ESTIMATED_ARIMR_PROFILE_GROUPS } from "./estimated-crop-profile-mappings.js";
import { ESTIMATED_CROP_WATER_PROFILES } from "./estimated-crop-profiles.js";

export type NumericRange = {
  minimum: number;
  maximum: number;
};

export type Fao56GrowthStageDurations = {
  initialDays: number;
  developmentDays: number;
  midSeasonDays: number;
  lateSeasonDays: number;
};

export type Fao56StageDurationReference = {
  context: string;
  durations: Fao56GrowthStageDurations;
  use: "reference-only-not-poland-calibrated";
  source?: "project-adapted-reference";
};

export const RAPESEED_PHENOLOGY_REFERENCE_SOURCE = {
  provider: "INRAE",
  dataset: "CropWat SB2023-colza phase proportions; 317–335 day NE Poland season envelope",
  version: "0.3.0",
  sourceUrl: "https://inrae.r-universe.dev/CropWat",
  accessedOn: "2026-11-22",
  supportingSourceUrl: "https://doi.org/10.3390/agronomy14030437",
  adaptation:
    "Project screening scenarios: proportions of the INRAE Aveyron reference are rescaled to the 317 and 335 day season lengths observed in NE Poland. Individual phase dates are not locally calibrated.",
} as const;

function rapeseedReferenceDurations(seasonDays: number): Fao56GrowthStageDurations {
  // INRAE SB2023-colza has 15/165/61/37 days in Aveyron. Preserve these proportions,
  // but bracket the full cycle with the 317–335 days observed by Jankowski et al. (2024),
  // Table 2, in NE Poland. This calendar adaptation is not local phase calibration.
  const ratio = seasonDays / 278;
  const initialDays = Math.round(15 * ratio);
  const developmentDays = Math.round(165 * ratio);
  const midSeasonDays = Math.round(61 * ratio);
  return {
    initialDays,
    developmentDays,
    midSeasonDays,
    lateSeasonDays: seasonDays - initialDays - developmentDays - midSeasonDays,
  };
}

export type CropWaterProfile = {
  id: string;
  label: string;
  seasonType: "spring" | "winter" | "perennial";
  iungCropGroup: string;
  cropCoefficients: {
    initial: NumericRange;
    midSeason: NumericRange;
    lateSeason: NumericRange;
  };
  maximumRootDepthMeters: NumericRange;
  depletionFractionAtFiveMillimetersPerDay: number;
  stageDurationReferences: readonly Fao56StageDurationReference[];
  limitations: readonly string[];
};

const exact = (value: number): NumericRange => ({ minimum: value, maximum: value });
const range = (minimum: number, maximum: number): NumericRange => ({ minimum, maximum });

export const FAO56_CROP_PARAMETER_SOURCES = [
  {
    id: "fao56-table-11",
    locator: "FAO Irrigation and Drainage Paper 56, Chapter 6, Table 11",
    role: "Reference growth-stage lengths; contexts are not calibrated for Poland.",
    url: "https://www.fao.org/4/X0490E/x0490e0b.htm",
  },
  {
    id: "fao56-table-12",
    locator: "FAO Irrigation and Drainage Paper 56, Chapter 6, Table 12",
    role: "Single crop coefficients for non-stressed, well-managed crops.",
    url: "https://www.fao.org/4/X0490E/x0490e0b.htm",
  },
  {
    id: "fao56-table-22",
    locator: "FAO Irrigation and Drainage Paper 56, Chapter 8, Table 22",
    role: "Maximum root-depth ranges and depletion fractions at ETc about 5 mm/day.",
    url: "https://www.fao.org/4/x0490E/x0490e0e.htm",
  },
] as const;

export const CROP_WATER_PROFILES = [
  {
    id: "winter-wheat",
    label: "Winter wheat",
    seasonType: "winter",
    iungCropGroup: "winter-cereals",
    cropCoefficients: {
      initial: range(0.4, 0.7),
      midSeason: exact(1.15),
      lateSeason: range(0.25, 0.4),
    },
    maximumRootDepthMeters: range(1.5, 1.8),
    depletionFractionAtFiveMillimetersPerDay: 0.55,
    stageDurationReferences: [
      {
        context: "November planting, Mediterranean reference",
        durations: {
          initialDays: 30,
          developmentDays: 140,
          midSeasonDays: 40,
          lateSeasonDays: 30,
        },
        use: "reference-only-not-poland-calibrated",
      },
      {
        context: "October planting, Idaho reference with a long cold-season initial stage",
        durations: {
          initialDays: 160,
          developmentDays: 75,
          midSeasonDays: 75,
          lateSeasonDays: 25,
        },
        use: "reference-only-not-poland-calibrated",
      },
    ],
    limitations: [
      "The initial coefficient range represents FAO-56 frozen- and non-frozen-soil variants.",
      "Neither FAO-56 stage-duration reference is a Polish phenology calendar.",
    ],
  },
  {
    id: "spring-wheat",
    label: "Spring wheat",
    seasonType: "spring",
    iungCropGroup: "spring-cereals",
    cropCoefficients: {
      initial: exact(0.3),
      midSeason: exact(1.15),
      lateSeason: range(0.25, 0.4),
    },
    maximumRootDepthMeters: range(1, 1.5),
    depletionFractionAtFiveMillimetersPerDay: 0.55,
    stageDurationReferences: [
      {
        context: "March/April planting at 35-45 degrees latitude",
        durations: {
          initialDays: 20,
          developmentDays: 25,
          midSeasonDays: 60,
          lateSeasonDays: 30,
        },
        use: "reference-only-not-poland-calibrated",
      },
    ],
    limitations: [
      "The FAO-56 duration reference does not cover the full latitude range of Poland.",
      "The higher late-season coefficient is for hand-harvested crops.",
    ],
  },
  {
    id: "grain-maize",
    label: "Grain maize",
    seasonType: "spring",
    iungCropGroup: "grain-maize",
    cropCoefficients: {
      initial: exact(0.3),
      midSeason: exact(1.2),
      lateSeason: range(0.35, 0.6),
    },
    maximumRootDepthMeters: range(1, 1.7),
    depletionFractionAtFiveMillimetersPerDay: 0.55,
    stageDurationReferences: [
      {
        context: "April planting, Spain/California spring-summer reference",
        durations: {
          initialDays: 30,
          developmentDays: 40,
          midSeasonDays: 50,
          lateSeasonDays: 30,
        },
        use: "reference-only-not-poland-calibrated",
      },
      {
        context: "April planting, Idaho reference",
        durations: {
          initialDays: 30,
          developmentDays: 40,
          midSeasonDays: 50,
          lateSeasonDays: 50,
        },
        use: "reference-only-not-poland-calibrated",
      },
    ],
    limitations: [
      "The late-season range distinguishes high-moisture harvest from field-dried grain.",
      "Stage durations require local phenology or a user-supplied sowing date before operational use.",
    ],
  },
  {
    id: "potato",
    label: "Potato",
    seasonType: "spring",
    iungCropGroup: "potato",
    cropCoefficients: {
      initial: exact(0.5),
      midSeason: exact(1.15),
      lateSeason: range(0.4, 0.75),
    },
    maximumRootDepthMeters: range(0.4, 0.6),
    depletionFractionAtFiveMillimetersPerDay: 0.35,
    stageDurationReferences: [
      {
        context: "April planting, Europe reference",
        durations: {
          initialDays: 30,
          developmentDays: 35,
          midSeasonDays: 50,
          lateSeasonDays: 30,
        },
        use: "reference-only-not-poland-calibrated",
      },
      {
        context: "May planting, continental-climate reference",
        durations: {
          initialDays: 25,
          developmentDays: 30,
          midSeasonDays: 45,
          lateSeasonDays: 30,
        },
        use: "reference-only-not-poland-calibrated",
      },
    ],
    limitations: [
      "The lower late-season coefficient is the FAO-56 long-season variant with vine kill.",
    ],
  },
  {
    id: "sugar-beet",
    label: "Sugar beet",
    seasonType: "spring",
    iungCropGroup: "sugar-beet",
    cropCoefficients: {
      initial: exact(0.35),
      midSeason: exact(1.2),
      lateSeason: range(0.7, 1),
    },
    maximumRootDepthMeters: range(0.7, 1.2),
    depletionFractionAtFiveMillimetersPerDay: 0.55,
    stageDurationReferences: [
      {
        context: "April planting, Idaho reference",
        durations: {
          initialDays: 50,
          developmentDays: 40,
          midSeasonDays: 50,
          lateSeasonDays: 40,
        },
        use: "reference-only-not-poland-calibrated",
      },
      {
        context: "May planting, Mediterranean reference",
        durations: {
          initialDays: 25,
          developmentDays: 35,
          midSeasonDays: 50,
          lateSeasonDays: 50,
        },
        use: "reference-only-not-poland-calibrated",
      },
    ],
    limitations: [
      "The upper late-season coefficient requires significant rain or irrigation in the final month.",
      "FAO-56 does not provide a Poland-specific stage-duration row.",
    ],
  },
  {
    id: "rapeseed",
    label: "Rapeseed",
    seasonType: "winter",
    iungCropGroup: "rapeseed-and-turnip-rape",
    cropCoefficients: {
      initial: exact(0.35),
      midSeason: range(1, 1.15),
      lateSeason: exact(0.35),
    },
    maximumRootDepthMeters: range(1, 1.5),
    depletionFractionAtFiveMillimetersPerDay: 0.6,
    stageDurationReferences: [317, 335].map(
      (seasonDays): Fao56StageDurationReference => ({
        context: `Project-adapted INRAE SB2023-colza phase proportions over a ${seasonDays}-day NE Poland season; not locally calibrated phase dates`,
        durations: rapeseedReferenceDurations(seasonDays),
        use: "reference-only-not-poland-calibrated",
        source: "project-adapted-reference",
      }),
    ),
    limitations: [
      "Phase proportions come from INRAE CropWat 0.3.0 SB2023-colza, rescaled to a 317–335 day NE Poland season envelope; not FAO-56 Table 11.",
      "The lower mid-season coefficient represents a less dense rainfed stand.",
      "Proportional calendar adaptation does not establish actual crop phases or winter dormancy on the parcel.",
    ],
  },
  ...ADDITIONAL_CROP_WATER_PROFILES,
  ...ESTIMATED_CROP_WATER_PROFILES,
] as const satisfies readonly CropWaterProfile[];

export type CropWaterProfileId = (typeof CROP_WATER_PROFILES)[number]["id"];

export const ARIMR_CROP_PROFILE_MAPPINGS = [
  {
    arimrCropId: "burak-cukrowy",
    profileId: "sugar-beet",
    parameterMatch: "species-reference",
    basis: "Exact crop and use represented by the FAO-56 sugar beet profile.",
  },
  {
    arimrCropId: "kukurydza-na-ziarno",
    profileId: "grain-maize",
    parameterMatch: "species-reference",
    basis: "Exact grain-maize use represented by the FAO-56 field maize profile.",
  },
  {
    arimrCropId: "pszenica-zwyczajna-jara",
    profileId: "spring-wheat",
    parameterMatch: "species-reference",
    basis: "Common spring wheat matches the FAO-56 spring wheat profile and season.",
  },
  {
    arimrCropId: "pszenica-zwyczajna-ozima",
    profileId: "winter-wheat",
    parameterMatch: "species-reference",
    basis: "Common winter wheat matches the FAO-56 winter wheat profile and season.",
  },
  {
    arimrCropId: "rzepak-ozimy",
    profileId: "rapeseed",
    parameterMatch: "species-reference",
    basis:
      "The ARiMR crop is the rapeseed/canola crop represented by FAO-56; winter phenology remains explicit.",
  },
  {
    arimrCropId: "ziemniak",
    profileId: "potato",
    parameterMatch: "species-reference",
    basis: "Exact crop represented by the FAO-56 potato profile.",
  },
  ...(
    [
      ["pszenica-orkisz-jary", "spring-wheat"],
      ["pszenica-orkisz-ozimy", "winter-wheat"],
      ["pszenica-plaskurka-jara", "spring-wheat"],
      ["pszenica-plaskurka-ozima", "winter-wheat"],
      ["pszenica-samopsza-jara", "spring-wheat"],
      ["pszenica-samopsza-ozima", "winter-wheat"],
    ] as const
  ).map(([arimrCropId, profileId]) => ({
    arimrCropId,
    profileId,
    parameterMatch: "group-proxy" as const,
    basis:
      "Project wheat-group proxy for spelt, emmer or einkorn, preserving the spring/winter form. FAO-56 (1998), Chapter 6 permits crop-group references under comparable canopy and management. Common-wheat Kc, roots, depletion and calendar are screening assumptions, not species-specific calibration. https://www.fao.org/4/X0490E/x0490e0b.htm",
  })),
  ...(
    [
      ["pszenzyto-jare", "spring-wheat"],
      ["pszenzyto-ozime", "winter-wheat"],
    ] as const
  ).map(([arimrCropId, profileId]) => ({
    arimrCropId,
    profileId,
    parameterMatch: "group-proxy" as const,
    basis:
      "Project triticale proxy using common-wheat Kc, roots, depletion and phase references, preserving spring/winter form. FAO-56 crop-group transfer is a screening assumption, not a species-specific triticale calibration. https://www.fao.org/4/X0490E/x0490e0b.htm",
  })),
  ...ADDITIONAL_ARIMR_PROFILE_GROUPS.flatMap((group) =>
    group.crops.map((arimrCropId) => ({
      arimrCropId,
      profileId: group.profileId,
      parameterMatch:
        "approximateCrops" in group && group.approximateCrops.some((id) => id === arimrCropId)
          ? ("group-proxy" as const)
          : ("species-reference" as const),
      basis:
        "approximateCrops" in group && group.approximateCrops.some((id) => id === arimrCropId)
          ? "FAO-56 related-species or harvest-use proxy; species parameters or management are not an exact reference match. Production calendar remains an explicit assumption."
          : "FAO-56 species reference; production calendar and management remain explicit assumptions.",
    })),
  ),
  ...ESTIMATED_ARIMR_PROFILE_GROUPS.flatMap((group) =>
    group.crops.map((arimrCropId) => ({
      arimrCropId,
      profileId: group.profileId,
      parameterMatch: "group-proxy" as const,
      basis: `Project group estimate using ${group.profileId}. This is an explicitly assumed canopy, root-zone and management analogue, not a verified species match. Actual cutting, mixture composition and establishment are unknown. FAO-56 Chapters 6 and 8: https://www.fao.org/4/X0490E/x0490e0b.htm https://www.fao.org/4/x0490E/x0490e0e.htm`,
    })),
  ),
] as const satisfies readonly {
  arimrCropId: string;
  profileId: CropWaterProfileId;
  parameterMatch: "species-reference" | "group-proxy";
  basis: string;
}[];

export function findCropWaterProfileIdForArimrCrop(arimrCropId: string): CropWaterProfileId | null {
  return (
    ARIMR_CROP_PROFILE_MAPPINGS.find((mapping) => mapping.arimrCropId === arimrCropId)?.profileId ??
    null
  );
}

export function getCropWaterProfileAssumptionsForArimrCrop(arimrCropId: string): string[] {
  const mapping = ARIMR_CROP_PROFILE_MAPPINGS.find(
    (candidate) => candidate.arimrCropId === arimrCropId,
  );
  if (!mapping) return [];
  return [mapping.basis, ...findCropWaterProfile(mapping.profileId).limitations];
}

export type CropModelCapability =
  | { kind: "environment-only"; profileId: null }
  | { kind: "species-reference" | "approximate"; profileId: CropWaterProfileId };

export function getCropModelCapability(arimrCropId: string): CropModelCapability {
  const mapping = ARIMR_CROP_PROFILE_MAPPINGS.find(
    (candidate) => candidate.arimrCropId === arimrCropId,
  );
  if (!mapping) return { kind: "environment-only", profileId: null };

  const profile = findCropWaterProfile(mapping.profileId);
  const borrowedReference =
    mapping.parameterMatch === "group-proxy" ||
    profile.stageDurationReferences.some((stage) => stage.source === "project-adapted-reference");
  return {
    kind: borrowedReference ? "approximate" : "species-reference",
    profileId: mapping.profileId,
  };
}

export function findCropWaterProfile(id: CropWaterProfileId): CropWaterProfile {
  const profile = CROP_WATER_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new RangeError(`Unknown crop water profile: ${id}`);
  return profile;
}
