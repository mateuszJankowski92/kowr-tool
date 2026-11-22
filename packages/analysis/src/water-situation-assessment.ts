import { FAO56_NUMERIC_TOLERANCE } from "./fao56-water-stress.js";

export type Fao56BalanceClassification =
  | "no-significant-shortage-indications"
  | "elevated-shortage-risk"
  | "strong-shortage-indications"
  | "indeterminate"
  | "insufficient-data";

export type ScenarioConsensus =
  | "consistent-no-stress"
  | "consistent-stress"
  | "consistent-complete-depletion"
  | "scenario-disagreement"
  | "insufficient-data";

export type SatelliteSignal =
  | "pattern-compatible-with-shortage"
  | "pattern-incompatible-with-shortage"
  | "neutral"
  | "unavailable"
  | "not-qualified";

export type SatelliteConsistency =
  | "consistent-with-balance"
  | "conflicts-with-balance"
  | "neutral"
  | "unavailable"
  | "not-qualified"
  | "not-comparable";

export type CoreWaterBalanceScenarioResult = {
  id: string;
  fieldCapacity: "10-kpa" | "33-kpa";
  waterStressCoefficient: number | null;
};

export type WaterSituationAssessment = {
  balanceClassification: Fao56BalanceClassification;
  scenarioConsensus: ScenarioConsensus;
  scenarioResults: readonly CoreWaterBalanceScenarioResult[];
  balanceReason:
    | "core-scenarios-show-no-stress"
    | "core-scenarios-show-stress"
    | "core-scenarios-reach-complete-depletion"
    | "core-scenarios-disagree"
    | "required-core-scenario-missing";
  satellite: {
    signal: SatelliteSignal;
    consistency: SatelliteConsistency;
    limitsInterpretation: boolean;
  };
};

export type Fao56BalanceAssessment = Pick<
  WaterSituationAssessment,
  "balanceClassification" | "scenarioConsensus" | "scenarioResults" | "balanceReason"
>;

function requireWaterStressCoefficient(value: number | null): void {
  if (
    value !== null &&
    (!Number.isFinite(value) ||
      value < -FAO56_NUMERIC_TOLERANCE ||
      value > 1 + FAO56_NUMERIC_TOLERANCE)
  ) {
    throw new RangeError("waterStressCoefficient must be null or between 0 and 1.");
  }
}

export function assessSatelliteConsistency(
  signal: SatelliteSignal,
  balanceClassification: Fao56BalanceClassification,
): WaterSituationAssessment["satellite"] {
  if (signal === "unavailable" || signal === "not-qualified" || signal === "neutral") {
    return {
      signal,
      consistency: signal,
      limitsInterpretation: signal !== "neutral",
    };
  }

  if (balanceClassification === "indeterminate" || balanceClassification === "insufficient-data") {
    return {
      signal,
      consistency: "not-comparable",
      limitsInterpretation: true,
    };
  }

  const balanceShowsShortage = balanceClassification !== "no-significant-shortage-indications";
  const satelliteShowsShortage = signal === "pattern-compatible-with-shortage";
  const consistency =
    balanceShowsShortage === satelliteShowsShortage
      ? "consistent-with-balance"
      : "conflicts-with-balance";

  return {
    signal,
    consistency,
    limitsInterpretation: consistency === "conflicts-with-balance",
  };
}

export function assessWaterSituation(input: {
  scenarioResults: readonly CoreWaterBalanceScenarioResult[];
  satelliteSignal: SatelliteSignal;
}): WaterSituationAssessment {
  const balance = assessFao56Balance({ scenarioResults: input.scenarioResults });

  return {
    ...balance,
    satellite: assessSatelliteConsistency(input.satelliteSignal, balance.balanceClassification),
  };
}

export function assessFao56Balance(input: {
  scenarioResults: readonly CoreWaterBalanceScenarioResult[];
}): Fao56BalanceAssessment {
  const scenarioResults = input.scenarioResults;

  for (const scenario of scenarioResults) {
    requireWaterStressCoefficient(scenario.waterStressCoefficient);
  }

  const representedFieldCapacities = new Set(
    scenarioResults.map(({ fieldCapacity }) => fieldCapacity),
  );
  const requiredScenarioMissing =
    !representedFieldCapacities.has("10-kpa") ||
    !representedFieldCapacities.has("33-kpa") ||
    scenarioResults.some(({ waterStressCoefficient }) => waterStressCoefficient === null);

  let balanceClassification: Fao56BalanceClassification;
  let scenarioConsensus: ScenarioConsensus;
  let balanceReason: WaterSituationAssessment["balanceReason"];

  if (requiredScenarioMissing) {
    balanceClassification = "insufficient-data";
    scenarioConsensus = "insufficient-data";
    balanceReason = "required-core-scenario-missing";
  } else {
    const coefficients = scenarioResults.map(({ waterStressCoefficient }) =>
      Math.min(1, Math.max(0, waterStressCoefficient ?? 0)),
    );
    const stressStates = coefficients.map(
      (coefficient) => coefficient < 1 - FAO56_NUMERIC_TOLERANCE,
    );
    const scenariosAgree = stressStates.every((state) => state === stressStates[0]);

    if (!scenariosAgree) {
      balanceClassification = "indeterminate";
      scenarioConsensus = "scenario-disagreement";
      balanceReason = "core-scenarios-disagree";
    } else if (!stressStates[0]) {
      balanceClassification = "no-significant-shortage-indications";
      scenarioConsensus = "consistent-no-stress";
      balanceReason = "core-scenarios-show-no-stress";
    } else {
      balanceClassification = "elevated-shortage-risk";
      scenarioConsensus = "consistent-stress";
      balanceReason = "core-scenarios-show-stress";
    }
  }

  return {
    balanceClassification,
    scenarioConsensus,
    scenarioResults,
    balanceReason,
  };
}
