import type { HistoricalWaterAssessmentResponse } from "@kowr/contracts";

const weatherSource = {
  id: "open-meteo-era5-land" as const,
  provider: "Open-Meteo" as const,
  dataset: "Historical Weather API",
  model: "ERA5-Land",
  spatialResolution: "0.1° (about 9–11 km)",
  timeStandard: "Daily values in Europe/Warsaw time",
  license: "CC BY 4.0",
  sourceUrl: "https://archive-api.open-meteo.com/v1/archive",
  retrievedAt: "2026-11-21T22:00:00.000Z",
};

const conclusions = [
  "modelled-stress",
  "no-modelled-stress",
  "ambiguous",
  "modelled-stress",
  "no-modelled-stress",
  "modelled-stress",
  "no-modelled-stress",
  "ambiguous",
  "modelled-stress",
  "no-modelled-stress",
] as const;

const seasons: HistoricalWaterAssessmentResponse["seasons"] = conclusions.map(
  (conclusion, index) => {
    const referenceYear = 2024 - index;
    const showsStress = conclusion !== "no-modelled-stress";
    return {
      referenceYear,
      periodStartDate: `${referenceYear}-03-20`,
      periodEndDate: `${referenceYear}-06-30`,
      status: "complete",
      conclusion,
      finalDayConclusion: conclusion,
      scenarios: {
        totalCount: 32,
        completeCount: 32,
        conclusionsAgree: conclusion !== "ambiguous",
      },
      stressDays: showsStress
        ? { minimum: 3 + index, maximum: 12 + index }
        : { minimum: 0, maximum: 0 },
      longestStressEpisodeDays: showsStress ? 5 + index : 0,
      longestStressEpisodeDaysRange: showsStress
        ? { minimum: 2 + index, maximum: 5 + index }
        : { minimum: 0, maximum: 0 },
      minimumWaterStressCoefficient: showsStress ? 0.42 : 1,
      minimumWaterStressCoefficientRange: showsStress
        ? { minimum: 0.42, maximum: 0.86 }
        : { minimum: 1, maximum: 1 },
      finalWaterStressCoefficient: showsStress
        ? { minimum: 0.7, maximum: 1 }
        : { minimum: 1, maximum: 1 },
      cumulativeEvapotranspirationDeficitMm: showsStress
        ? { minimum: 4 + index, maximum: 32 + index }
        : { minimum: 0, maximum: 0 },
      initialConditionSensitivity: {
        classification: conclusion === "ambiguous" ? "material" : "no-material-influence",
        evaluatedPairCount: 16,
        agreeingPairCount: conclusion === "ambiguous" ? 8 : 16,
        dryStartOnlyStressPairCount: conclusion === "ambiguous" ? 8 : 0,
        wetStartOnlyStressPairCount: 0,
        convergence: {
          classification: conclusion === "ambiguous" ? "mixed" : "converged",
          convergedPairCount: conclusion === "ambiguous" ? 8 : 16,
          persistentPairCount: conclusion === "ambiguous" ? 8 : 0,
          firstConvergenceDay: { minimum: 4, maximum: 18 },
        },
      },
      growthStages: (["initial", "development", "mid-season", "late-season"] as const).map(
        (growthStage) => ({
          growthStage,
          conclusion,
          completeScenarioCount: 32,
          stressDays: showsStress ? { minimum: 1, maximum: 4 } : { minimum: 0, maximum: 0 },
          longestStressEpisodeDays: showsStress ? 3 : 0,
          cumulativeEvapotranspirationDeficitMm: showsStress
            ? { minimum: 1, maximum: 8 }
            : { minimum: 0, maximum: 0 },
        }),
      ),
      incompleteReasonCodes: [],
      weather: {
        status: "complete",
        expectedDayCount: 103,
        precipitationAvailableDayCount: 103,
        et0AvailableDayCount: 103,
        completeDayCount: 103,
        missingDays: [],
        latestContiguousCompleteDate: `${referenceYear}-06-30`,
        source: weatherSource,
        attempts: [{ providerRole: "primary", outcome: "complete" }],
      },
    };
  },
);

export const historicalWaterAssessment: HistoricalWaterAssessmentResponse = {
  status: "complete",
  analysisDate: "2025-06-30",
  parcel: { identifier: "141211_2.0038.102", parcelNumber: "102" },
  crop: {
    arimrId: "pszenica-zwyczajna-jara",
    modelKind: "species-reference",
    profileId: "spring-wheat",
    supported: true,
  },
  phenology: { basis: "project-standard", seasonStartDates: ["2025-03-25"] },
  referenceYears: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
  analogousSeasonRule: "same-phenology-shifted-by-whole-years",
  leapDayRule: "clamp-to-last-day-of-february",
  soil: {
    status: "complete",
    reusedForAllSeasons: true,
    source: {
      provider: "ISRIC",
      dataset: "SoilGrids250m 2.0",
      resolutionMeters: 250,
      predictionStatistic: "Q0.50",
      uncertaintyInterval: "Q0.05-Q0.95",
      license: "CC BY 4.0",
      sourceUrl: "https://maps.isric.org/mapserv",
      retrievedAt: "2026-11-21T22:00:00.000Z",
    },
  },
  summary: {
    requiredSeasonCount: 10,
    completeSeasonCount: 10,
    incompleteSeasonCount: 0,
    seasonsWithModelledStress: 4,
    seasonsWithoutModelledStress: 4,
    ambiguousSeasonCount: 2,
    stressOccurrence: { numerator: 4, denominator: 10 },
    noStressOccurrence: { numerator: 4, denominator: 10 },
    ambiguousOccurrence: { numerator: 2, denominator: 10 },
    stressDaysRange: { minimum: 0, maximum: 21 },
    medianStressDaysRange: { minimum: 4, maximum: 11 },
    longestStressEpisodeDays: 14,
    actualDataPeriod: { from: "2015-03-20", to: "2024-06-30" },
  },
  recurrence: {
    growthStages: [
      {
        growthStage: "initial",
        completeSeasonCount: 10,
        seasonsWithStress: 1,
        scenarioDependentSeasonCount: 0,
        seasonsWithoutStress: 9,
        stressScenarioDays: 14,
        eligibleScenarioDays: 9600,
      },
      {
        growthStage: "development",
        completeSeasonCount: 10,
        seasonsWithStress: 3,
        scenarioDependentSeasonCount: 1,
        seasonsWithoutStress: 6,
        stressScenarioDays: 124,
        eligibleScenarioDays: 9600,
      },
      {
        growthStage: "mid-season",
        completeSeasonCount: 10,
        seasonsWithStress: 5,
        scenarioDependentSeasonCount: 2,
        seasonsWithoutStress: 3,
        stressScenarioDays: 390,
        eligibleScenarioDays: 11200,
      },
      {
        growthStage: "late-season",
        completeSeasonCount: 10,
        seasonsWithStress: 2,
        scenarioDependentSeasonCount: 1,
        seasonsWithoutStress: 7,
        stressScenarioDays: 75,
        eligibleScenarioDays: 8000,
      },
    ],
    mostAffectedDayPositions: [
      {
        dayOfSeason: 76,
        completeSeasonCount: 10,
        seasonsWithStress: 5,
        scenarioDependentSeasonCount: 2,
        seasonsWithoutStress: 3,
        stressScenarioDays: 62,
        eligibleScenarioDays: 320,
      },
    ],
  },
  seasons,
  limitations: [
    "COUNTERFACTUAL_CURRENT_CROP_PROFILE",
    "HISTORICAL_CROP_ROTATION_NOT_CONFIRMED",
    "CURRENT_PARCEL_GEOMETRY_USED_FOR_HISTORY",
    "CURRENT_SOILGRIDS_MODEL_REUSED_FOR_HISTORY",
    "HISTORICAL_IRRIGATION_RUNOFF_AND_CAPILLARY_RISE_UNKNOWN",
    "MODELLED_SUSCEPTIBILITY_NOT_CONFIRMED_HISTORICAL_LOSS",
    "WEATHER_POINT_MODEL",
    "SCENARIO_RANGES_ARE_NOT_CONFIDENCE_INTERVALS",
  ],
  timing: {
    totalMs: 8120,
    parcelLookupMs: 420,
    soilFetchMs: 2800,
    weatherAndSimulationMs: 7690,
    maximumWeatherConcurrency: 3,
  },
};
