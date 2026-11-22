/** Keep domain calculations pure and deterministic in this package. */
export function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export * from "./crop-assessment-period.js";
export * from "./crop-water-profiles.js";
export * from "./fao56-season-engine.js";
export * from "./fao56-water-stress.js";
export * from "./historical-water-assessment.js";
export * from "./recommendations.js";
export * from "./requested-date-weather.js";
export * from "./satellite-observations.js";
export * from "./satellite-water-signal.js";
export * from "./soil-profile.js";
export * from "./standard-phenology.js";
export * from "./surroundings-analysis.js";
export * from "./terrain-analysis.js";
export * from "./water-situation-assessment.js";
export * from "./weather-conditions.js";
