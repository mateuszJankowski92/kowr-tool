import type { Fao56PhenologyScenario } from "./fao56-season-engine.js";

export type CropAssessmentPeriod = {
  scope: "analysis-day" | "completed-season";
  evaluatedThroughDate: string;
};

/** After every reference season ends, retain its last common modelled day explicitly. */
export function resolveCropAssessmentPeriod(
  requestedDate: string,
  scenarios: readonly Fao56PhenologyScenario[],
): CropAssessmentPeriod {
  const endDates = scenarios.map(({ seasonStartDate, durations }) => {
    const days = Object.values(durations).reduce((sum, value) => sum + value, 0);
    return new Date(Date.parse(`${seasonStartDate}T00:00:00Z`) + (days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
  });
  const commonEnd = [...endDates].sort()[0];
  // Do not drop a later-starting scenario that has not begun by the common end.
  if (
    commonEnd &&
    endDates.every((date) => date < requestedDate) &&
    scenarios.every(({ seasonStartDate }) => seasonStartDate <= commonEnd)
  ) {
    return { scope: "completed-season", evaluatedThroughDate: commonEnd };
  }
  return { scope: "analysis-day", evaluatedThroughDate: requestedDate };
}
