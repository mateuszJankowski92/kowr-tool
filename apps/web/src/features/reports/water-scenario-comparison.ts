import type { WaterAssessmentResponse } from "@kowr/contracts";

type Scenario = WaterAssessmentResponse["scenarios"]["results"][number];
type Configuration = Scenario["configuration"];

export type WaterScenarioVariant = {
  label: string;
  shortLabel: string;
  totalCount: number;
  completeCount: number;
  stressDays: { minimum: number; maximum: number } | null;
  finalDay: { withStress: number; withoutStress: number; unavailable: number };
};

export type WaterScenarioComparison = {
  id: string;
  label: string;
  explanation: string;
  technical: boolean;
  variants: WaterScenarioVariant[];
};

const number = (value: number) => new Intl.NumberFormat("pl-PL").format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

const dimensions: {
  id: string;
  label: string;
  explanation: string;
  technical?: boolean;
  value: (configuration: Configuration) => string;
  shortValue?: (configuration: Configuration) => string;
}[] = [
  {
    id: "initial-water",
    label: "Zapas wody na początku okresu",
    explanation:
      "Nie znamy początkowej wilgotności gleby, dlatego model porównuje dwa skrajne stany.",
    shortValue: ({ initialCondition }) =>
      initialCondition === "field-capacity" ? "Mokry początek" : "Skrajnie suchy początek",
    value: ({ initialCondition }) =>
      initialCondition === "field-capacity"
        ? "Mokry początek — gleba po odsączeniu nadmiaru wody"
        : "Skrajnie suchy początek — zapas dostępnej wody wyczerpany",
  },
  {
    id: "field-capacity",
    label: "Ilość wody zatrzymywanej przez glebę",
    explanation:
      "Dwa warianty pojemności polowej z modelu gleby; nie są pomiarem aktualnej wilgotności.",
    shortValue: ({ fieldCapacity }) => `Wariant ${fieldCapacity === "10-kpa" ? "10" : "33"} kPa`,
    value: ({ fieldCapacity }) =>
      `Pojemność polowa przy ${fieldCapacity === "10-kpa" ? "10" : "33"} kPa`,
  },
  {
    id: "root-depth",
    label: "Zasięg korzeni",
    explanation: "Model sprawdza różne głębokości, z których roślina może pobierać wodę.",
    shortValue: ({ maximumRootDepthMeters }) => `Korzenie do ${number(maximumRootDepthMeters)} m`,
    value: ({ maximumRootDepthMeters }) =>
      `Maksymalna głębokość ${number(maximumRootDepthMeters)} m`,
  },
  {
    id: "wetting-time",
    label: "Pora opadu",
    explanation:
      "Dane dobowe nie wskazują pory opadu. Model sprawdza, czy woda trafia do gleby przed, czy po dziennym zużyciu.",
    shortValue: ({ wettingTiming }) =>
      wettingTiming === "early-day" ? "Opad przed zużyciem wody" : "Opad po zużyciu wody",
    value: ({ wettingTiming }) =>
      wettingTiming === "early-day"
        ? "Opad przed dziennym zużyciem wody"
        : "Opad po dziennym zużyciu wody",
  },
  {
    id: "phenology",
    label: "Termin i przebieg rozwoju uprawy",
    explanation:
      "Porównane kalendarze rozwoju są założeniami. Długości faz podano w kolejności: początek, rozwój, pełny rozwój, dojrzewanie.",
    value: ({ seasonStartDate, stageDurations }) =>
      `Początek ${date(seasonStartDate)}; fazy ${stageDurations.initialDays}/${stageDurations.developmentDays}/${stageDurations.midSeasonDays}/${stageDurations.lateSeasonDays} dni`,
  },
  ...(
    [
      ["cropCoefficientInitial", "początek rozwoju"],
      ["cropCoefficientMidSeason", "pełny rozwój"],
      ["cropCoefficientLateSeason", "koniec rozwoju"],
    ] as const
  ).map(([key, label]) => ({
    id: key,
    label: `Parowanie i transpiracja uprawy — ${label}`,
    explanation:
      "Współczynnik Kc określa zapotrzebowanie uprawy względem parowania referencyjnego. Większa wartość oznacza większe zużycie wody w modelu.",
    technical: true,
    value: (configuration: Configuration) => `Kc = ${number(configuration[key])}`,
  })),
  {
    id: "initial-roots",
    label: "Początkowy zasięg korzeni",
    explanation: "Głębokość strefy korzeniowej na początku symulacji.",
    technical: true,
    value: ({ initialRootDepthMeters }) => `${number(initialRootDepthMeters)} m`,
  },
];

export function compareWaterScenarios(result: WaterAssessmentResponse): WaterScenarioComparison[] {
  return dimensions.flatMap((dimension) => {
    const groups = new Map<string, WaterScenarioVariant>();
    for (const scenario of result.scenarios.results) {
      const label = dimension.value(scenario.configuration);
      const group = groups.get(label) ?? {
        label,
        shortLabel: dimension.shortValue?.(scenario.configuration) ?? label,
        totalCount: 0,
        completeCount: 0,
        stressDays: null,
        finalDay: { withStress: 0, withoutStress: 0, unavailable: 0 },
      };
      group.totalCount += 1;
      if (scenario.status === "complete") {
        group.completeCount += 1;
        const days = scenario.summary.stressDays;
        group.stressDays = {
          minimum: Math.min(group.stressDays?.minimum ?? days, days),
          maximum: Math.max(group.stressDays?.maximum ?? days, days),
        };
        // Episodes already carry the engine's stress decision; do not introduce a UI threshold.
        if (
          scenario.summary.finalWaterStressCoefficient === null ||
          scenario.summary.simulatedDays === 0
        ) {
          group.finalDay.unavailable += 1;
        } else if (
          scenario.stressEpisodes.some(({ endDate }) => endDate === result.weather.period.endDate)
        ) {
          group.finalDay.withStress += 1;
        } else {
          group.finalDay.withoutStress += 1;
        }
      } else {
        group.finalDay.unavailable += 1;
      }
      groups.set(label, group);
    }
    if (groups.size < 2) return [];
    return [
      {
        id: dimension.id,
        label: dimension.label,
        explanation: dimension.explanation,
        technical: dimension.technical ?? false,
        variants: [...groups.values()],
      },
    ];
  });
}
