import type {
  Fao56GrowthStage,
  Fao56PhenologyScenario,
  Fao56SeasonEngineResult,
} from "./fao56-season-engine.js";
import { FAO56_NUMERIC_TOLERANCE } from "./fao56-water-stress.js";

const DEFAULT_HISTORICAL_SEASON_COUNT = 10;

export type HistoricalSeasonPlan = {
  referenceYear: number;
  analysisDate: string;
  phenologyScenarios: readonly Fao56PhenologyScenario[];
  periodStartDate: string;
  periodEndDate: string;
};

export type HistoricalSeasonSimulation = {
  plan: HistoricalSeasonPlan;
  engineResult: Fao56SeasonEngineResult | null;
  incompleteReasonCodes: readonly string[];
};

type NumericRange = {
  minimum: number;
  maximum: number;
};

export type HistoricalSeasonConclusion =
  | "modelled-stress"
  | "no-modelled-stress"
  | "ambiguous"
  | "unavailable";

export type HistoricalSeasonResult = {
  referenceYear: number;
  periodStartDate: string;
  periodEndDate: string;
  status: "complete" | "incomplete";
  conclusion: HistoricalSeasonConclusion;
  finalDayConclusion: HistoricalSeasonConclusion;
  scenarios: {
    totalCount: number;
    completeCount: number;
    conclusionsAgree: boolean | null;
  };
  stressDays: NumericRange | null;
  longestStressEpisodeDays: number | null;
  longestStressEpisodeDaysRange: NumericRange | null;
  minimumWaterStressCoefficient: number | null;
  minimumWaterStressCoefficientRange: NumericRange | null;
  finalWaterStressCoefficient: NumericRange | null;
  cumulativeEvapotranspirationDeficitMm: NumericRange | null;
  initialConditionSensitivity: {
    classification: "no-material-influence" | "dry-start-only" | "material" | "unavailable";
    evaluatedPairCount: number;
    agreeingPairCount: number;
    dryStartOnlyStressPairCount: number;
    wetStartOnlyStressPairCount: number;
    convergence: {
      classification: "converged" | "mixed" | "persistent" | "unavailable";
      convergedPairCount: number;
      persistentPairCount: number;
      firstConvergenceDay: NumericRange | null;
    };
  };
  growthStages: readonly HistoricalGrowthStageResult[];
  incompleteReasonCodes: readonly string[];
};

export type HistoricalGrowthStageResult = {
  growthStage: Fao56GrowthStage;
  conclusion: HistoricalSeasonConclusion;
  completeScenarioCount: number;
  stressDays: NumericRange | null;
  longestStressEpisodeDays: number | null;
  cumulativeEvapotranspirationDeficitMm: NumericRange | null;
};

export type HistoricalRecurrence = {
  growthStages: readonly {
    growthStage: Fao56GrowthStage;
    completeSeasonCount: number;
    seasonsWithStress: number;
    scenarioDependentSeasonCount: number;
    seasonsWithoutStress: number;
    stressScenarioDays: number;
    eligibleScenarioDays: number;
  }[];
  mostAffectedDayPositions: readonly {
    dayOfSeason: number;
    completeSeasonCount: number;
    seasonsWithStress: number;
    scenarioDependentSeasonCount: number;
    seasonsWithoutStress: number;
    stressScenarioDays: number;
    eligibleScenarioDays: number;
  }[];
};

export type HistoricalWaterAssessment = {
  status: "complete" | "partial" | "insufficient-data";
  requiredSeasonCount: number;
  completeSeasonCount: number;
  incompleteSeasonCount: number;
  seasonsWithModelledStress: number;
  seasonsWithoutModelledStress: number;
  ambiguousSeasonCount: number;
  stressOccurrence: {
    numerator: number;
    denominator: number;
  };
  noStressOccurrence: {
    numerator: number;
    denominator: number;
  };
  ambiguousOccurrence: {
    numerator: number;
    denominator: number;
  };
  stressDaysRange: NumericRange | null;
  medianStressDaysRange: NumericRange | null;
  longestStressEpisodeDays: number | null;
  actualDataPeriod: { from: string; to: string } | null;
  recurrence: HistoricalRecurrence;
  seasons: readonly HistoricalSeasonResult[];
};

function parseCalendarDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Invalid calendar date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  if (new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Shifts a calendar date by whole years. When the target year has no matching day
 * (currently only 29 February), the date is clamped to the last day of that month.
 */
export function shiftCalendarDateByYears(date: string, yearOffset: number): string {
  if (!Number.isInteger(yearOffset)) throw new RangeError("yearOffset must be an integer.");
  const { year, month, day } = parseCalendarDate(date);
  const targetYear = year + yearOffset;
  return formatDate(targetYear, month, Math.min(day, daysInMonth(targetYear, month)));
}

export function planAnalogousHistoricalSeasons(input: {
  analysisDate: string;
  phenologyScenarios: readonly Fao56PhenologyScenario[];
  seasonCount?: number;
}): HistoricalSeasonPlan[] {
  const { year: analysisYear } = parseCalendarDate(input.analysisDate);
  const seasonCount = input.seasonCount ?? DEFAULT_HISTORICAL_SEASON_COUNT;
  if (!Number.isInteger(seasonCount) || seasonCount <= 0) {
    throw new RangeError("seasonCount must be a positive integer.");
  }
  if (input.phenologyScenarios.length === 0) {
    throw new RangeError("At least one phenology scenario is required.");
  }
  for (const scenario of input.phenologyScenarios) parseCalendarDate(scenario.seasonStartDate);

  return Array.from({ length: seasonCount }, (_, index) => {
    const yearOffset = -(index + 1);
    const analysisDate = shiftCalendarDateByYears(input.analysisDate, yearOffset);
    const phenologyScenarios = input.phenologyScenarios.map((scenario) => ({
      ...scenario,
      id: `${scenario.id}__historical-${analysisYear + yearOffset}`,
      seasonStartDate: shiftCalendarDateByYears(scenario.seasonStartDate, yearOffset),
    }));
    const periodStartDate = phenologyScenarios
      .map(({ seasonStartDate }) => seasonStartDate)
      .sort()[0];
    if (!periodStartDate) throw new RangeError("A historical season requires phenology.");
    return {
      referenceYear: analysisYear + yearOffset,
      analysisDate,
      phenologyScenarios,
      periodStartDate,
      periodEndDate: analysisDate,
    };
  });
}

function numericRange(values: readonly number[]): NumericRange | null {
  return values.length === 0
    ? null
    : { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? null);
}

function finalDayConclusionFor(result: Fao56SeasonEngineResult): HistoricalSeasonConclusion {
  switch (result.balanceAssessment.scenarioConsensus) {
    case "consistent-no-stress":
      return "no-modelled-stress";
    case "consistent-stress":
    case "consistent-complete-depletion":
      return "modelled-stress";
    case "scenario-disagreement":
      return "ambiguous";
    case "insufficient-data":
      return "unavailable";
  }
}

function conclusionForStressStates(stressStates: readonly boolean[]): HistoricalSeasonConclusion {
  if (stressStates.length === 0) return "unavailable";
  if (stressStates.every(Boolean)) return "modelled-stress";
  if (stressStates.every((state) => !state)) return "no-modelled-stress";
  return "ambiguous";
}

function longestEpisode(stressStates: readonly boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const stressed of stressStates) {
    current = stressed ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function growthStageResults(
  scenarios: Fao56SeasonEngineResult["scenarios"],
): HistoricalGrowthStageResult[] {
  const stages: readonly Fao56GrowthStage[] = [
    "initial",
    "development",
    "mid-season",
    "late-season",
  ];
  return stages.map((growthStage) => {
    const metrics = scenarios.flatMap((scenario) => {
      if (scenario.status !== "complete") return [];
      const days = scenario.days.filter((day) => day.growthStage === growthStage);
      if (days.length === 0) return [];
      const stressStates = days.map(
        (day) => day.waterStressCoefficient < 1 - FAO56_NUMERIC_TOLERANCE,
      );
      return [
        {
          stressDays: stressStates.filter(Boolean).length,
          longestStressEpisodeDays: longestEpisode(stressStates),
          cumulativeEvapotranspirationDeficitMm: days.reduce(
            (sum, day) =>
              sum +
              Math.max(
                0,
                day.potentialCropEvapotranspirationMm - day.adjustedCropEvapotranspirationMm,
              ),
            0,
          ),
        },
      ];
    });
    return {
      growthStage,
      conclusion: conclusionForStressStates(metrics.map(({ stressDays }) => stressDays > 0)),
      completeScenarioCount: metrics.length,
      stressDays: numericRange(metrics.map(({ stressDays }) => stressDays)),
      longestStressEpisodeDays:
        metrics.length === 0
          ? null
          : Math.max(...metrics.map(({ longestStressEpisodeDays }) => longestStressEpisodeDays)),
      cumulativeEvapotranspirationDeficitMm: numericRange(
        metrics.map(
          ({ cumulativeEvapotranspirationDeficitMm }) => cumulativeEvapotranspirationDeficitMm,
        ),
      ),
    };
  });
}

function initialConditionKey(
  configuration: Fao56SeasonEngineResult["scenarios"][number]["configuration"],
): string {
  return [
    configuration.phenologyScenarioId,
    configuration.fieldCapacity,
    configuration.wettingTiming,
    configuration.cropCoefficientInitial,
    configuration.cropCoefficientMidSeason,
    configuration.cropCoefficientLateSeason,
    configuration.initialRootDepthMeters,
    configuration.maximumRootDepthMeters,
  ].join("|");
}

function initialConditionSensitivity(
  scenarios: Fao56SeasonEngineResult["scenarios"],
): HistoricalSeasonResult["initialConditionSensitivity"] {
  const groups = new Map<string, Fao56SeasonEngineResult["scenarios"]>();
  for (const scenario of scenarios) {
    if (scenario.status !== "complete") continue;
    const key = initialConditionKey(scenario.configuration);
    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }

  let evaluatedPairCount = 0;
  let agreeingPairCount = 0;
  let dryStartOnlyStressPairCount = 0;
  let wetStartOnlyStressPairCount = 0;
  let agreeingStressPairCount = 0;
  const firstConvergenceDays: number[] = [];
  for (const group of groups.values()) {
    const wet = group.find(
      ({ configuration }) => configuration.initialCondition === "field-capacity",
    );
    const dry = group.find(
      ({ configuration }) => configuration.initialCondition === "wilting-point",
    );
    if (!wet || !dry) continue;
    evaluatedPairCount += 1;
    const wetStress = wet.summary.stressDays > 0;
    const dryStress = dry.summary.stressDays > 0;
    const burdensAgree =
      wet.summary.stressDays === dry.summary.stressDays &&
      wet.summary.longestStressEpisodeDays === dry.summary.longestStressEpisodeDays &&
      Math.abs(
        wet.summary.cumulativeEvapotranspirationDeficitMm -
          dry.summary.cumulativeEvapotranspirationDeficitMm,
      ) <= FAO56_NUMERIC_TOLERANCE;
    if (burdensAgree) {
      agreeingPairCount += 1;
      if (wetStress) agreeingStressPairCount += 1;
    } else if (dryStress && !wetStress) dryStartOnlyStressPairCount += 1;
    else if (wetStress && !dryStress) wetStartOnlyStressPairCount += 1;

    const firstConvergedDay = wet.days.find((wetDay, index) => {
      const dryDay = dry.days[index];
      return (
        dryDay !== undefined &&
        wetDay.date === dryDay.date &&
        Math.abs(wetDay.rootZoneDepletionAtEndMm - dryDay.rootZoneDepletionAtEndMm) <=
          FAO56_NUMERIC_TOLERANCE &&
        Math.abs(wetDay.waterStressCoefficient - dryDay.waterStressCoefficient) <=
          FAO56_NUMERIC_TOLERANCE
      );
    })?.dayOfSeason;
    if (firstConvergedDay !== undefined) firstConvergenceDays.push(firstConvergedDay);
  }

  const differingPairCount = evaluatedPairCount - agreeingPairCount;
  const convergedPairCount = firstConvergenceDays.length;
  const persistentPairCount = evaluatedPairCount - convergedPairCount;
  return {
    classification:
      evaluatedPairCount === 0
        ? "unavailable"
        : differingPairCount === 0
          ? "no-material-influence"
          : dryStartOnlyStressPairCount === differingPairCount && agreeingStressPairCount === 0
            ? "dry-start-only"
            : "material",
    evaluatedPairCount,
    agreeingPairCount,
    dryStartOnlyStressPairCount,
    wetStartOnlyStressPairCount,
    convergence: {
      classification:
        evaluatedPairCount === 0
          ? "unavailable"
          : convergedPairCount === evaluatedPairCount
            ? "converged"
            : convergedPairCount === 0
              ? "persistent"
              : "mixed",
      convergedPairCount,
      persistentPairCount,
      firstConvergenceDay: numericRange(firstConvergenceDays),
    },
  };
}

function mapSeason(simulation: HistoricalSeasonSimulation): HistoricalSeasonResult {
  const result = simulation.engineResult;
  const completeScenarios = result?.scenarios.filter(({ status }) => status === "complete") ?? [];
  const allScenariosComplete =
    result !== null &&
    result.scenarios.length > 0 &&
    completeScenarios.length === result.scenarios.length;
  const scenarioIssueCodes =
    result?.scenarios.flatMap(({ issues }) => issues.map(({ code }) => code)) ?? [];
  const incompleteReasonCodes = [
    ...new Set([...simulation.incompleteReasonCodes, ...scenarioIssueCodes]),
  ].sort();
  const conclusion = allScenariosComplete
    ? conclusionForStressStates(completeScenarios.map(({ summary }) => summary.stressDays > 0))
    : "unavailable";
  const finalDayConclusion = allScenariosComplete ? finalDayConclusionFor(result) : "unavailable";

  return {
    referenceYear: simulation.plan.referenceYear,
    periodStartDate: simulation.plan.periodStartDate,
    periodEndDate: simulation.plan.periodEndDate,
    status: allScenariosComplete ? "complete" : "incomplete",
    conclusion,
    finalDayConclusion,
    scenarios: {
      totalCount: result?.scenarios.length ?? 0,
      completeCount: completeScenarios.length,
      conclusionsAgree: conclusion === "unavailable" ? null : conclusion !== "ambiguous",
    },
    stressDays: numericRange(completeScenarios.map(({ summary }) => summary.stressDays)),
    longestStressEpisodeDays:
      completeScenarios.length === 0
        ? null
        : Math.max(...completeScenarios.map(({ summary }) => summary.longestStressEpisodeDays)),
    longestStressEpisodeDaysRange: numericRange(
      completeScenarios.map(({ summary }) => summary.longestStressEpisodeDays),
    ),
    minimumWaterStressCoefficient:
      completeScenarios.length === 0
        ? null
        : Math.min(
            ...completeScenarios.flatMap(({ summary }) =>
              summary.minimumWaterStressCoefficient === null
                ? []
                : [summary.minimumWaterStressCoefficient],
            ),
          ),
    minimumWaterStressCoefficientRange: numericRange(
      completeScenarios.flatMap(({ summary }) =>
        summary.minimumWaterStressCoefficient === null
          ? []
          : [summary.minimumWaterStressCoefficient],
      ),
    ),
    finalWaterStressCoefficient: numericRange(
      completeScenarios.flatMap(({ summary }) =>
        summary.finalWaterStressCoefficient === null ? [] : [summary.finalWaterStressCoefficient],
      ),
    ),
    cumulativeEvapotranspirationDeficitMm: numericRange(
      completeScenarios.map(({ summary }) => summary.cumulativeEvapotranspirationDeficitMm),
    ),
    initialConditionSensitivity: initialConditionSensitivity(completeScenarios),
    growthStages: growthStageResults(completeScenarios),
    incompleteReasonCodes,
  };
}

type RecurrenceAccumulator = {
  completeSeasonYears: Set<number>;
  stressedSeasonYears: Set<number>;
  scenarioDependentSeasonYears: Set<number>;
  noStressSeasonYears: Set<number>;
  stressScenarioDays: number;
  eligibleScenarioDays: number;
};

function createAccumulator(): RecurrenceAccumulator {
  return {
    completeSeasonYears: new Set(),
    stressedSeasonYears: new Set(),
    scenarioDependentSeasonYears: new Set(),
    noStressSeasonYears: new Set(),
    stressScenarioDays: 0,
    eligibleScenarioDays: 0,
  };
}

function recurrenceFor(simulations: readonly HistoricalSeasonSimulation[]): HistoricalRecurrence {
  const stages = new Map<Fao56GrowthStage, RecurrenceAccumulator>();
  const positions = new Map<number, RecurrenceAccumulator>();
  const complete = simulations.filter((simulation) => {
    const scenarios = simulation.engineResult?.scenarios ?? [];
    return scenarios.length > 0 && scenarios.every(({ status }) => status === "complete");
  });

  for (const simulation of complete) {
    const year = simulation.plan.referenceYear;
    const scenarios = simulation.engineResult?.scenarios ?? [];
    for (const phase of growthStageResults(scenarios)) {
      if (phase.completeScenarioCount === 0) continue;
      const stage = stages.get(phase.growthStage) ?? createAccumulator();
      stage.completeSeasonYears.add(year);
      if (phase.conclusion === "modelled-stress") stage.stressedSeasonYears.add(year);
      else if (phase.conclusion === "ambiguous") stage.scenarioDependentSeasonYears.add(year);
      else if (phase.conclusion === "no-modelled-stress") stage.noStressSeasonYears.add(year);
      for (const scenario of scenarios) {
        const days = scenario.days.filter((day) => day.growthStage === phase.growthStage);
        stage.eligibleScenarioDays += days.length;
        stage.stressScenarioDays += days.filter(
          (day) => day.waterStressCoefficient < 1 - FAO56_NUMERIC_TOLERANCE,
        ).length;
      }
      stages.set(phase.growthStage, stage);
    }

    const dayPositions = new Set(
      scenarios.flatMap(({ days }) => days.map(({ dayOfSeason }) => dayOfSeason)),
    );
    for (const dayOfSeason of dayPositions) {
      const matchingDays = scenarios.flatMap(({ days }) =>
        days.filter((day) => day.dayOfSeason === dayOfSeason),
      );
      if (matchingDays.length === 0) continue;
      const stressStates = matchingDays.map(
        (day) => day.waterStressCoefficient < 1 - FAO56_NUMERIC_TOLERANCE,
      );
      const conclusion = conclusionForStressStates(stressStates);
      const position = positions.get(dayOfSeason) ?? createAccumulator();
      position.completeSeasonYears.add(year);
      position.eligibleScenarioDays += matchingDays.length;
      position.stressScenarioDays += stressStates.filter(Boolean).length;
      if (conclusion === "modelled-stress") position.stressedSeasonYears.add(year);
      else if (conclusion === "ambiguous") position.scenarioDependentSeasonYears.add(year);
      else position.noStressSeasonYears.add(year);
      positions.set(dayOfSeason, position);
    }
  }

  const growthStageOrder: readonly Fao56GrowthStage[] = [
    "initial",
    "development",
    "mid-season",
    "late-season",
  ];
  const growthStages = growthStageOrder.map((growthStage) => {
    const accumulator = stages.get(growthStage) ?? createAccumulator();
    return {
      growthStage,
      completeSeasonCount: accumulator.completeSeasonYears.size,
      seasonsWithStress: accumulator.stressedSeasonYears.size,
      scenarioDependentSeasonCount: accumulator.scenarioDependentSeasonYears.size,
      seasonsWithoutStress: accumulator.noStressSeasonYears.size,
      stressScenarioDays: accumulator.stressScenarioDays,
      eligibleScenarioDays: accumulator.eligibleScenarioDays,
    };
  });
  const mostAffectedDayPositions = [...positions.entries()]
    .filter(
      ([, accumulator]) =>
        accumulator.stressedSeasonYears.size > 0 ||
        accumulator.scenarioDependentSeasonYears.size > 0,
    )
    .sort(([leftDay, left], [rightDay, right]) => {
      const leftRate = left.stressScenarioDays / left.eligibleScenarioDays;
      const rightRate = right.stressScenarioDays / right.eligibleScenarioDays;
      return (
        rightRate - leftRate ||
        right.stressScenarioDays - left.stressScenarioDays ||
        leftDay - rightDay
      );
    })
    .slice(0, 20)
    .map(([dayOfSeason, accumulator]) => ({
      dayOfSeason,
      completeSeasonCount: accumulator.completeSeasonYears.size,
      seasonsWithStress: accumulator.stressedSeasonYears.size,
      scenarioDependentSeasonCount: accumulator.scenarioDependentSeasonYears.size,
      seasonsWithoutStress: accumulator.noStressSeasonYears.size,
      stressScenarioDays: accumulator.stressScenarioDays,
      eligibleScenarioDays: accumulator.eligibleScenarioDays,
    }));

  return { growthStages, mostAffectedDayPositions };
}

export function aggregateHistoricalWaterAssessment(
  simulations: readonly HistoricalSeasonSimulation[],
): HistoricalWaterAssessment {
  if (simulations.length === 0) throw new RangeError("At least one historical season is required.");
  const years = simulations.map(({ plan }) => plan.referenceYear);
  if (new Set(years).size !== years.length)
    throw new RangeError("Historical season years must be unique.");

  const orderedSimulations = [...simulations].sort(
    (left, right) => right.plan.referenceYear - left.plan.referenceYear,
  );
  const seasons = orderedSimulations.map(mapSeason);
  const completeSeasons = seasons.filter(({ status }) => status === "complete");
  const seasonsWithModelledStress = completeSeasons.filter(
    ({ conclusion }) => conclusion === "modelled-stress",
  ).length;
  const seasonsWithoutModelledStress = completeSeasons.filter(
    ({ conclusion }) => conclusion === "no-modelled-stress",
  ).length;
  const ambiguousSeasonCount = completeSeasons.filter(
    ({ conclusion }) => conclusion === "ambiguous",
  ).length;
  const stressDayMinimums = completeSeasons.flatMap(({ stressDays }) =>
    stressDays ? [stressDays.minimum] : [],
  );
  const stressDayMaximums = completeSeasons.flatMap(({ stressDays }) =>
    stressDays ? [stressDays.maximum] : [],
  );
  const periodStarts = completeSeasons.map(({ periodStartDate }) => periodStartDate);
  const periodEnds = completeSeasons.map(({ periodEndDate }) => periodEndDate);
  const denominator = completeSeasons.length;

  return {
    status:
      denominator === simulations.length
        ? "complete"
        : denominator > 0
          ? "partial"
          : "insufficient-data",
    requiredSeasonCount: simulations.length,
    completeSeasonCount: denominator,
    incompleteSeasonCount: simulations.length - denominator,
    seasonsWithModelledStress,
    seasonsWithoutModelledStress,
    ambiguousSeasonCount,
    stressOccurrence: { numerator: seasonsWithModelledStress, denominator },
    noStressOccurrence: { numerator: seasonsWithoutModelledStress, denominator },
    ambiguousOccurrence: { numerator: ambiguousSeasonCount, denominator },
    stressDaysRange:
      stressDayMinimums.length === 0
        ? null
        : { minimum: Math.min(...stressDayMinimums), maximum: Math.max(...stressDayMaximums) },
    medianStressDaysRange:
      stressDayMinimums.length === 0
        ? null
        : {
            minimum: median(stressDayMinimums) ?? 0,
            maximum: median(stressDayMaximums) ?? 0,
          },
    longestStressEpisodeDays:
      completeSeasons.length === 0
        ? null
        : Math.max(
            ...completeSeasons.map(({ longestStressEpisodeDays }) => longestStressEpisodeDays ?? 0),
          ),
    actualDataPeriod:
      periodStarts.length === 0
        ? null
        : { from: [...periodStarts].sort()[0] ?? "", to: [...periodEnds].sort().at(-1) ?? "" },
    recurrence: recurrenceFor(orderedSimulations),
    seasons,
  };
}
