import { describe, expect, it } from "vitest";
import {
  adjustDepletionFractionForCropEvapotranspiration,
  calculateAdjustedCropEvapotranspirationMm,
  calculateDailyRootZoneWaterBalance,
  calculateFao56DailyStep,
  calculateReadilyAvailableWaterMm,
  calculateRootGrowthDepletionAdjustmentMm,
  calculateTotalAvailableWaterMm,
  calculateWaterStressCoefficient,
} from "./fao56-water-stress.js";

describe("FAO-56 soil-water stress calculations", () => {
  it.each([
    {
      crop: "onion on loamy sand",
      fieldCapacity: 0.15,
      wiltingPoint: 0.06,
      rootDepthMeters: 0.4,
      depletionFraction: 0.3,
      expectedTawMm: 36,
      expectedRawMm: 10.8,
    },
    {
      crop: "tomato on silt",
      fieldCapacity: 0.32,
      wiltingPoint: 0.15,
      rootDepthMeters: 0.8,
      depletionFraction: 0.4,
      expectedTawMm: 136,
      expectedRawMm: 54.4,
    },
    {
      crop: "maize on silt",
      fieldCapacity: 0.32,
      wiltingPoint: 0.15,
      rootDepthMeters: 1.2,
      depletionFraction: 0.55,
      expectedTawMm: 204,
      expectedRawMm: 112.2,
    },
    {
      crop: "maize on silty clay",
      fieldCapacity: 0.35,
      wiltingPoint: 0.23,
      rootDepthMeters: 1.2,
      depletionFraction: 0.55,
      expectedTawMm: 144,
      expectedRawMm: 79.2,
    },
  ])("reproduces FAO-56 Example 36 for $crop", (example) => {
    const totalAvailableWaterMm = calculateTotalAvailableWaterMm({
      fieldCapacityVolumetricFraction: example.fieldCapacity,
      wiltingPointVolumetricFraction: example.wiltingPoint,
      rootDepthMeters: example.rootDepthMeters,
    });

    expect(totalAvailableWaterMm).toBeCloseTo(example.expectedTawMm, 10);
    expect(
      calculateReadilyAvailableWaterMm(totalAvailableWaterMm, example.depletionFraction),
    ).toBeCloseTo(example.expectedRawMm, 10);
  });

  it.each([
    { depletionMm: 55, expectedKs: 1, expectedEtcAdjMm: 6 },
    { depletionMm: 61, expectedKs: 1, expectedEtcAdjMm: 6 },
    { depletionMm: 67, expectedKs: 0.96875, expectedEtcAdjMm: 5.8125 },
    { depletionMm: 72.8, expectedKs: 0.9083333333, expectedEtcAdjMm: 5.45 },
    { depletionMm: 100.8, expectedKs: 0.6166666667, expectedEtcAdjMm: 3.7 },
  ])("reproduces FAO-56 Example 37 at depletion $depletionMm mm", (example) => {
    const waterStressCoefficient = calculateWaterStressCoefficient({
      totalAvailableWaterMm: 160,
      rootZoneDepletionMm: example.depletionMm,
      depletionFraction: 0.4,
    });

    expect(waterStressCoefficient).toBeCloseTo(example.expectedKs, 8);
    expect(
      calculateAdjustedCropEvapotranspirationMm({
        referenceEvapotranspirationMm: 5,
        cropCoefficient: 1.2,
        waterStressCoefficient,
      }),
    ).toBeCloseTo(example.expectedEtcAdjMm, 8);
  });

  it("reproduces the ten daily depletion steps in FAO-56 Example 37", () => {
    const expectedEndOfDayDepletionMm = [61, 67, 72.8, 78.3, 83.4, 88.2, 92.6, 96.9, 100.8, 104.5];
    let rootZoneDepletionMm = 55;

    for (const expectedDepletionMm of expectedEndOfDayDepletionMm) {
      const result = calculateFao56DailyStep({
        previousRootZoneDepletionMm: rootZoneDepletionMm,
        totalAvailableWaterMm: 160,
        rootGrowthDepletionAdjustmentMm: 0,
        precipitationMm: 0,
        runoffMm: 0,
        irrigationMm: 0,
        capillaryRiseMm: 0,
        wettingTiming: "early-day",
        referenceEvapotranspirationMm: 5,
        cropCoefficient: 1.2,
        depletionFractionAtFiveMillimeters: 0.4,
        depletionFractionMode: "table-value",
      });

      rootZoneDepletionMm = result.rootZoneDepletionMm;

      expect(Math.round(rootZoneDepletionMm * 10) / 10).toBe(expectedDepletionMm);
    }
  });

  it("adjusts the depletion fraction for daily potential crop evapotranspiration", () => {
    expect(adjustDepletionFractionForCropEvapotranspiration(0.55, 5)).toBeCloseTo(0.55);
    expect(adjustDepletionFractionForCropEvapotranspiration(0.55, 8)).toBeCloseTo(0.43);
    expect(adjustDepletionFractionForCropEvapotranspiration(0.55, 1)).toBeCloseTo(0.71);
  });

  it("makes the optional FAO-56 p adjustment explicit", () => {
    const input = {
      referenceEvapotranspirationMm: 5,
      cropCoefficient: 1.2,
      totalAvailableWaterMm: 160,
      rootZoneDepletionMm: 60,
      depletionFractionAtFiveMillimeters: 0.4,
    } as const;

    expect(
      calculateFao56DailyStep({
        previousRootZoneDepletionMm: input.rootZoneDepletionMm,
        totalAvailableWaterMm: input.totalAvailableWaterMm,
        rootGrowthDepletionAdjustmentMm: 0,
        precipitationMm: 0,
        runoffMm: 0,
        irrigationMm: 0,
        capillaryRiseMm: 0,
        wettingTiming: "early-day",
        referenceEvapotranspirationMm: input.referenceEvapotranspirationMm,
        cropCoefficient: input.cropCoefficient,
        depletionFractionAtFiveMillimeters: input.depletionFractionAtFiveMillimeters,
        depletionFractionMode: "table-value",
      }).adjustedDepletionFraction,
    ).toBe(0.4);
    expect(
      calculateFao56DailyStep({
        previousRootZoneDepletionMm: input.rootZoneDepletionMm,
        totalAvailableWaterMm: input.totalAvailableWaterMm,
        rootGrowthDepletionAdjustmentMm: 0,
        precipitationMm: 0,
        runoffMm: 0,
        irrigationMm: 0,
        capillaryRiseMm: 0,
        wettingTiming: "early-day",
        referenceEvapotranspirationMm: input.referenceEvapotranspirationMm,
        cropCoefficient: input.cropCoefficient,
        depletionFractionAtFiveMillimeters: input.depletionFractionAtFiveMillimeters,
        depletionFractionMode: "adjust-for-etc",
      }).adjustedDepletionFraction,
    ).toBeCloseTo(0.36);
  });

  it("applies early-day wetting before Ks and reproduces FAO-56 Example 38 day 6", () => {
    const result = calculateFao56DailyStep({
      previousRootZoneDepletionMm: 21,
      totalAvailableWaterMm: 42.9,
      rootGrowthDepletionAdjustmentMm: 0,
      precipitationMm: 6,
      runoffMm: 0,
      irrigationMm: 0,
      capillaryRiseMm: 0,
      wettingTiming: "early-day",
      referenceEvapotranspirationMm: 2.7,
      cropCoefficient: 1,
      depletionFractionAtFiveMillimeters: 0.6,
      depletionFractionMode: "table-value",
    });

    expect(result.rootZoneDepletionAtStartMm).toBe(15);
    expect(result.waterStressCoefficient).toBe(1);
    expect(result.adjustedCropEvapotranspirationMm).toBeCloseTo(2.7);
    expect(Math.round(result.rootZoneDepletionMm)).toBe(18);
  });

  it("reproduces FAO-56 Example 38 early irrigation drainage order", () => {
    expect(
      calculateDailyRootZoneWaterBalance({
        previousRootZoneDepletionMm: 23,
        totalAvailableWaterMm: 39,
        precipitationMm: 0,
        runoffMm: 0,
        irrigationMm: 40,
        capillaryRiseMm: 0,
        adjustedCropEvapotranspirationMm: 5.5,
        wettingTiming: "early-day",
      }),
    ).toEqual({
      rootZoneDepletionAtStartMm: 0,
      rootZoneDepletionMm: 5.5,
      deepPercolationMm: 17,
      unmetCropEvapotranspirationMm: 0,
    });
  });

  it("enforces both daily depletion bounds and exposes unmet evapotranspiration", () => {
    expect(
      calculateDailyRootZoneWaterBalance({
        previousRootZoneDepletionMm: 99,
        totalAvailableWaterMm: 100,
        precipitationMm: 0,
        runoffMm: 0,
        irrigationMm: 0,
        capillaryRiseMm: 0,
        adjustedCropEvapotranspirationMm: 4,
        wettingTiming: "early-day",
      }),
    ).toMatchObject({
      rootZoneDepletionMm: 100,
      deepPercolationMm: 0,
      unmetCropEvapotranspirationMm: 3,
    });
    expect(
      calculateDailyRootZoneWaterBalance({
        previousRootZoneDepletionMm: 10,
        totalAvailableWaterMm: 100,
        precipitationMm: 30,
        runoffMm: 0,
        irrigationMm: 0,
        capillaryRiseMm: 0,
        adjustedCropEvapotranspirationMm: 4,
        wettingTiming: "early-day",
      }),
    ).toMatchObject({
      rootZoneDepletionAtStartMm: 0,
      rootZoneDepletionMm: 4,
      deepPercolationMm: 20,
    });
  });

  it("keeps late-day rain out of the same day's Ks calculation", () => {
    const early = calculateFao56DailyStep({
      previousRootZoneDepletionMm: 72,
      totalAvailableWaterMm: 160,
      rootGrowthDepletionAdjustmentMm: 0,
      precipitationMm: 20,
      runoffMm: 0,
      irrigationMm: 0,
      capillaryRiseMm: 0,
      wettingTiming: "early-day",
      referenceEvapotranspirationMm: 5,
      cropCoefficient: 1.2,
      depletionFractionAtFiveMillimeters: 0.4,
      depletionFractionMode: "table-value",
    });
    const late = calculateFao56DailyStep({
      previousRootZoneDepletionMm: 72,
      totalAvailableWaterMm: 160,
      rootGrowthDepletionAdjustmentMm: 0,
      precipitationMm: 20,
      runoffMm: 0,
      irrigationMm: 0,
      capillaryRiseMm: 0,
      wettingTiming: "late-day",
      referenceEvapotranspirationMm: 5,
      cropCoefficient: 1.2,
      depletionFractionAtFiveMillimeters: 0.4,
      depletionFractionMode: "table-value",
    });

    expect(early.rootZoneDepletionAtStartMm).toBe(52);
    expect(early.waterStressCoefficient).toBe(1);
    expect(late.rootZoneDepletionAtStartMm).toBe(72);
    expect(late.waterStressCoefficient).toBeLessThan(1);
  });

  it("calculates the FAO-56 depletion adjustment for a growing root zone", () => {
    expect(
      calculateRootGrowthDepletionAdjustmentMm({
        fieldCapacityVolumetricFraction: 0.23,
        newRootZoneWaterContentVolumetricFraction: 0.23,
        previousRootDepthMeters: 0.3,
        rootDepthMeters: 0.35,
      }),
    ).toBe(0);
    expect(
      calculateRootGrowthDepletionAdjustmentMm({
        fieldCapacityVolumetricFraction: 0.23,
        newRootZoneWaterContentVolumetricFraction: 0.2,
        previousRootDepthMeters: 0.3,
        rootDepthMeters: 0.35,
      }),
    ).toBeCloseTo(1.5);
  });

  it("keeps Ks inside physical bounds", () => {
    expect(
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 100,
        depletionFraction: 0.5,
      }),
    ).toBe(0);
    expect(
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 0,
        depletionFraction: 0.5,
      }),
    ).toBe(1);
  });

  it("rejects root-zone depletion outside its physical range", () => {
    expect(() =>
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 101,
        depletionFraction: 0.5,
      }),
    ).toThrow(RangeError);
  });

  it("accepts floating-point noise at the Ks bounds but rejects material overflow", () => {
    expect(
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 100 + 5e-10,
        depletionFraction: 0.5,
      }),
    ).toBe(0);
    expect(() =>
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 100 + 2e-9,
        depletionFraction: 0.5,
      }),
    ).toThrow(RangeError);
    expect(
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 50 + 5e-10,
        depletionFraction: 0.5,
      }),
    ).toBe(1);
    expect(
      calculateWaterStressCoefficient({
        totalAvailableWaterMm: 100,
        rootZoneDepletionMm: 50 + 1e-6,
        depletionFraction: 0.5,
      }),
    ).toBeLessThan(1);
  });
});
