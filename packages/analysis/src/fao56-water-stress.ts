export type Fao56SingleCoefficientStressInput = {
  referenceEvapotranspirationMm: number;
  cropCoefficient: number;
  totalAvailableWaterMm: number;
  rootZoneDepletionMm: number;
  depletionFractionAtFiveMillimeters: number;
  depletionFractionMode: "table-value" | "adjust-for-etc";
};

export type Fao56WettingTiming = "early-day" | "late-day";

export const FAO56_NUMERIC_TOLERANCE = 1e-9;

function requireFiniteNonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

function requireFraction(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

export function calculateTotalAvailableWaterMm(input: {
  fieldCapacityVolumetricFraction: number;
  wiltingPointVolumetricFraction: number;
  rootDepthMeters: number;
}): number {
  requireFraction(input.fieldCapacityVolumetricFraction, "fieldCapacityVolumetricFraction");
  requireFraction(input.wiltingPointVolumetricFraction, "wiltingPointVolumetricFraction");
  requireFiniteNonnegative(input.rootDepthMeters, "rootDepthMeters");

  if (input.fieldCapacityVolumetricFraction < input.wiltingPointVolumetricFraction) {
    throw new RangeError("Field capacity must not be below the wilting point.");
  }

  return (
    1_000 *
    (input.fieldCapacityVolumetricFraction - input.wiltingPointVolumetricFraction) *
    input.rootDepthMeters
  );
}

export function adjustDepletionFractionForCropEvapotranspiration(
  depletionFractionAtFiveMillimeters: number,
  cropEvapotranspirationMm: number,
): number {
  requireFraction(depletionFractionAtFiveMillimeters, "depletionFractionAtFiveMillimeters");
  requireFiniteNonnegative(cropEvapotranspirationMm, "cropEvapotranspirationMm");

  return Math.min(
    0.8,
    Math.max(0.1, depletionFractionAtFiveMillimeters + 0.04 * (5 - cropEvapotranspirationMm)),
  );
}

export function calculateReadilyAvailableWaterMm(
  totalAvailableWaterMm: number,
  depletionFraction: number,
): number {
  requireFiniteNonnegative(totalAvailableWaterMm, "totalAvailableWaterMm");
  requireFraction(depletionFraction, "depletionFraction");
  return totalAvailableWaterMm * depletionFraction;
}

export function calculateWaterStressCoefficient(input: {
  totalAvailableWaterMm: number;
  rootZoneDepletionMm: number;
  depletionFraction: number;
}): number {
  requireFiniteNonnegative(input.totalAvailableWaterMm, "totalAvailableWaterMm");
  requireFiniteNonnegative(input.rootZoneDepletionMm, "rootZoneDepletionMm");
  requireFraction(input.depletionFraction, "depletionFraction");

  if (input.rootZoneDepletionMm > input.totalAvailableWaterMm + FAO56_NUMERIC_TOLERANCE) {
    throw new RangeError("Root-zone depletion must not exceed total available water.");
  }
  if (input.totalAvailableWaterMm === 0) return 0;

  const rootZoneDepletionMm = Math.min(input.totalAvailableWaterMm, input.rootZoneDepletionMm);
  const readilyAvailableWaterMm = calculateReadilyAvailableWaterMm(
    input.totalAvailableWaterMm,
    input.depletionFraction,
  );
  if (rootZoneDepletionMm <= readilyAvailableWaterMm + FAO56_NUMERIC_TOLERANCE) return 1;

  const denominator = input.totalAvailableWaterMm - readilyAvailableWaterMm;
  if (denominator === 0) return rootZoneDepletionMm < input.totalAvailableWaterMm ? 1 : 0;

  const coefficient = (input.totalAvailableWaterMm - rootZoneDepletionMm) / denominator;
  if (coefficient <= FAO56_NUMERIC_TOLERANCE) return 0;
  if (coefficient >= 1 - FAO56_NUMERIC_TOLERANCE) return 1;
  return coefficient;
}

export function calculateAdjustedCropEvapotranspirationMm(input: {
  referenceEvapotranspirationMm: number;
  cropCoefficient: number;
  waterStressCoefficient: number;
}): number {
  requireFiniteNonnegative(input.referenceEvapotranspirationMm, "referenceEvapotranspirationMm");
  requireFiniteNonnegative(input.cropCoefficient, "cropCoefficient");
  requireFraction(input.waterStressCoefficient, "waterStressCoefficient");

  return input.referenceEvapotranspirationMm * input.cropCoefficient * input.waterStressCoefficient;
}

export function calculateDailyRootZoneWaterBalance(input: {
  previousRootZoneDepletionMm: number;
  totalAvailableWaterMm: number;
  precipitationMm: number;
  runoffMm: number;
  irrigationMm: number;
  capillaryRiseMm: number;
  adjustedCropEvapotranspirationMm: number;
  wettingTiming: Fao56WettingTiming;
}): {
  rootZoneDepletionAtStartMm: number;
  rootZoneDepletionMm: number;
  deepPercolationMm: number;
  unmetCropEvapotranspirationMm: number;
} {
  requireFiniteNonnegative(input.previousRootZoneDepletionMm, "previousRootZoneDepletionMm");
  requireFiniteNonnegative(input.totalAvailableWaterMm, "totalAvailableWaterMm");
  requireFiniteNonnegative(input.precipitationMm, "precipitationMm");
  requireFiniteNonnegative(input.runoffMm, "runoffMm");
  requireFiniteNonnegative(input.irrigationMm, "irrigationMm");
  requireFiniteNonnegative(input.capillaryRiseMm, "capillaryRiseMm");
  requireFiniteNonnegative(
    input.adjustedCropEvapotranspirationMm,
    "adjustedCropEvapotranspirationMm",
  );

  if (input.previousRootZoneDepletionMm > input.totalAvailableWaterMm + FAO56_NUMERIC_TOLERANCE) {
    throw new RangeError("Previous root-zone depletion must not exceed total available water.");
  }
  if (input.runoffMm > input.precipitationMm) {
    throw new RangeError("Runoff must not exceed precipitation.");
  }

  const previousRootZoneDepletionMm = Math.min(
    input.totalAvailableWaterMm,
    input.previousRootZoneDepletionMm,
  );
  const wettingMm =
    input.precipitationMm - input.runoffMm + input.irrigationMm + input.capillaryRiseMm;
  const rootZoneDepletionAtStartMm =
    input.wettingTiming === "early-day"
      ? Math.max(0, previousRootZoneDepletionMm - wettingMm)
      : previousRootZoneDepletionMm;
  const depletionAfterEvapotranspirationMm =
    rootZoneDepletionAtStartMm + input.adjustedCropEvapotranspirationMm;
  const unmetCropEvapotranspirationMm = Math.max(
    0,
    depletionAfterEvapotranspirationMm - input.totalAvailableWaterMm,
  );
  const boundedDepletionAfterEvapotranspirationMm = Math.min(
    input.totalAvailableWaterMm,
    depletionAfterEvapotranspirationMm,
  );
  const deepPercolationMm =
    input.wettingTiming === "early-day"
      ? Math.max(0, wettingMm - previousRootZoneDepletionMm)
      : Math.max(0, wettingMm - boundedDepletionAfterEvapotranspirationMm);
  const rootZoneDepletionMm =
    input.wettingTiming === "early-day"
      ? boundedDepletionAfterEvapotranspirationMm
      : Math.max(0, boundedDepletionAfterEvapotranspirationMm - wettingMm);

  return {
    rootZoneDepletionAtStartMm,
    rootZoneDepletionMm,
    deepPercolationMm,
    unmetCropEvapotranspirationMm,
  };
}

export function calculateRootGrowthDepletionAdjustmentMm(input: {
  fieldCapacityVolumetricFraction: number;
  newRootZoneWaterContentVolumetricFraction: number;
  previousRootDepthMeters: number;
  rootDepthMeters: number;
}): number {
  requireFraction(input.fieldCapacityVolumetricFraction, "fieldCapacityVolumetricFraction");
  requireFraction(
    input.newRootZoneWaterContentVolumetricFraction,
    "newRootZoneWaterContentVolumetricFraction",
  );
  requireFiniteNonnegative(input.previousRootDepthMeters, "previousRootDepthMeters");
  requireFiniteNonnegative(input.rootDepthMeters, "rootDepthMeters");

  if (input.rootDepthMeters + FAO56_NUMERIC_TOLERANCE < input.previousRootDepthMeters) {
    throw new RangeError("Root depth must not decrease during a daily growth step.");
  }
  if (
    input.newRootZoneWaterContentVolumetricFraction >
    input.fieldCapacityVolumetricFraction + FAO56_NUMERIC_TOLERANCE
  ) {
    throw new RangeError("Newly rooted soil water content must not exceed field capacity.");
  }

  return (
    1_000 *
    (input.fieldCapacityVolumetricFraction - input.newRootZoneWaterContentVolumetricFraction) *
    Math.max(0, input.rootDepthMeters - input.previousRootDepthMeters)
  );
}

export function calculateFao56DailyStep(input: {
  previousRootZoneDepletionMm: number;
  totalAvailableWaterMm: number;
  rootGrowthDepletionAdjustmentMm: number;
  precipitationMm: number;
  runoffMm: number;
  irrigationMm: number;
  capillaryRiseMm: number;
  wettingTiming: Fao56WettingTiming;
  referenceEvapotranspirationMm: number;
  cropCoefficient: number;
  depletionFractionAtFiveMillimeters: number;
  depletionFractionMode: "table-value" | "adjust-for-etc";
}) {
  requireFinite(input.rootGrowthDepletionAdjustmentMm, "rootGrowthDepletionAdjustmentMm");
  requireFiniteNonnegative(input.previousRootZoneDepletionMm, "previousRootZoneDepletionMm");
  requireFiniteNonnegative(input.totalAvailableWaterMm, "totalAvailableWaterMm");
  requireFiniteNonnegative(input.precipitationMm, "precipitationMm");
  requireFiniteNonnegative(input.runoffMm, "runoffMm");
  requireFiniteNonnegative(input.irrigationMm, "irrigationMm");
  requireFiniteNonnegative(input.capillaryRiseMm, "capillaryRiseMm");
  if (input.runoffMm > input.precipitationMm) {
    throw new RangeError("Runoff must not exceed precipitation.");
  }
  const depletionAfterRootGrowthMm =
    input.previousRootZoneDepletionMm + input.rootGrowthDepletionAdjustmentMm;
  if (depletionAfterRootGrowthMm < -FAO56_NUMERIC_TOLERANCE) {
    throw new RangeError("Depletion after root growth must not be negative.");
  }
  if (depletionAfterRootGrowthMm > input.totalAvailableWaterMm + FAO56_NUMERIC_TOLERANCE) {
    throw new RangeError("Depletion after root growth must not exceed total available water.");
  }

  const boundedDepletionAfterRootGrowthMm = Math.max(0, depletionAfterRootGrowthMm);
  const wettingMm =
    input.precipitationMm - input.runoffMm + input.irrigationMm + input.capillaryRiseMm;
  const rootZoneDepletionAtStartMm =
    input.wettingTiming === "early-day"
      ? Math.max(0, depletionAfterRootGrowthMm - wettingMm)
      : boundedDepletionAfterRootGrowthMm;
  const stress = calculateFao56SingleCoefficientStress({
    referenceEvapotranspirationMm: input.referenceEvapotranspirationMm,
    cropCoefficient: input.cropCoefficient,
    totalAvailableWaterMm: input.totalAvailableWaterMm,
    rootZoneDepletionMm: rootZoneDepletionAtStartMm,
    depletionFractionAtFiveMillimeters: input.depletionFractionAtFiveMillimeters,
    depletionFractionMode: input.depletionFractionMode,
  });
  const balance = calculateDailyRootZoneWaterBalance({
    previousRootZoneDepletionMm: boundedDepletionAfterRootGrowthMm,
    totalAvailableWaterMm: input.totalAvailableWaterMm,
    precipitationMm: input.precipitationMm,
    runoffMm: input.runoffMm,
    irrigationMm: input.irrigationMm,
    capillaryRiseMm: input.capillaryRiseMm,
    adjustedCropEvapotranspirationMm: stress.adjustedCropEvapotranspirationMm,
    wettingTiming: input.wettingTiming,
  });

  return {
    ...stress,
    ...balance,
    depletionAfterRootGrowthMm: boundedDepletionAfterRootGrowthMm,
  };
}

export function calculateFao56SingleCoefficientStress(input: Fao56SingleCoefficientStressInput) {
  const potentialCropEvapotranspirationMm =
    input.referenceEvapotranspirationMm * input.cropCoefficient;
  const adjustedDepletionFraction =
    input.depletionFractionMode === "adjust-for-etc"
      ? adjustDepletionFractionForCropEvapotranspiration(
          input.depletionFractionAtFiveMillimeters,
          potentialCropEvapotranspirationMm,
        )
      : input.depletionFractionAtFiveMillimeters;
  const readilyAvailableWaterMm = calculateReadilyAvailableWaterMm(
    input.totalAvailableWaterMm,
    adjustedDepletionFraction,
  );
  const waterStressCoefficient = calculateWaterStressCoefficient({
    totalAvailableWaterMm: input.totalAvailableWaterMm,
    rootZoneDepletionMm: input.rootZoneDepletionMm,
    depletionFraction: adjustedDepletionFraction,
  });

  return {
    adjustedCropEvapotranspirationMm: calculateAdjustedCropEvapotranspirationMm({
      referenceEvapotranspirationMm: input.referenceEvapotranspirationMm,
      cropCoefficient: input.cropCoefficient,
      waterStressCoefficient,
    }),
    adjustedDepletionFraction,
    potentialCropEvapotranspirationMm,
    readilyAvailableWaterMm,
    waterStressCoefficient,
  };
}
