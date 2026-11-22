import {
  calculateQuantile,
  comparePrecipitationTimeline,
  comparePrecipitationWithHistory,
  createComparableWeatherPeriods,
  findRepresentativeInteriorPoint,
  resolveWeatherPeriod,
  selectPrecipitationAggregation,
  summarizeComparablePrecipitationPrefix,
  summarizeSolarRadiationPeriod,
  summarizeWeatherPeriod,
} from "@kowr/analysis";
import type {
  WeatherConditionsRequest,
  WeatherConditionsResponse,
  WeatherDay,
} from "@kowr/contracts";
import {
  WeatherConditionsLocationUnavailableError,
  WeatherConditionsUnavailableError,
} from "./weather-conditions.errors.js";
import type {
  ProvidedWeatherSeries,
  WeatherConditionsProvider,
} from "./weather-conditions-provider.js";

async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  operation: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(inputs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const input = inputs[index];
      if (input !== undefined) results[index] = await operation(input);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return results;
}

function normalizeDays(
  days: readonly WeatherDay[],
  startDate: string,
  expectedDayCount: number,
): WeatherDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const start = new Date(`${startDate}T00:00:00.000Z`);

  return Array.from({ length: expectedDayCount }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateString = date.toISOString().slice(0, 10);
    return (
      byDate.get(dateString) ?? {
        date: dateString,
        precipitationMm: null,
        et0Mm: null,
        temperatureMeanCelsius: null,
        temperatureMinCelsius: null,
        temperatureMaxCelsius: null,
        solarRadiationMjPerM2: null,
      }
    );
  });
}

async function fetchPeriods(
  provider: WeatherConditionsProvider,
  periods: ReturnType<typeof createComparableWeatherPeriods>,
  longitude: number,
  latitude: number,
  signal?: AbortSignal,
): Promise<ProvidedWeatherSeries[]> {
  const firstPeriod = periods[0];
  if (!firstPeriod) return [];
  const selectedSeries = await provider.getDaily(
    longitude,
    latitude,
    firstPeriod.startDate,
    firstPeriod.endDate,
    signal,
  );
  const comparisonSeries = await mapWithConcurrency(periods.slice(1), 3, (period) =>
    provider.getDaily(longitude, latitude, period.startDate, period.endDate, signal),
  );
  return [selectedSeries, ...comparisonSeries];
}

export async function getWeatherConditions(
  input: WeatherConditionsRequest,
  primaryProvider: WeatherConditionsProvider,
  fallbackProvider: WeatherConditionsProvider,
  signal?: AbortSignal,
): Promise<WeatherConditionsResponse> {
  const location = findRepresentativeInteriorPoint(input.geometry);
  if (!location) throw new WeatherConditionsLocationUnavailableError();

  const period = resolveWeatherPeriod(input.dateSelection, input.periodPreset);
  const periods = createComparableWeatherPeriods(period, 11);
  let series: ProvidedWeatherSeries[];

  try {
    series = await fetchPeriods(primaryProvider, periods, location[0], location[1], signal);
  } catch {
    try {
      series = await fetchPeriods(fallbackProvider, periods, location[0], location[1], signal);
    } catch {
      throw new WeatherConditionsUnavailableError();
    }
  }

  const summaries = series.map((entry, index) => {
    const comparablePeriod = periods[index];
    if (!comparablePeriod) throw new WeatherConditionsUnavailableError();
    const days = normalizeDays(
      entry.days,
      comparablePeriod.startDate,
      comparablePeriod.expectedDayCount,
    );
    return {
      days,
      summary: summarizeWeatherPeriod(days, comparablePeriod.expectedDayCount),
    };
  });
  const selected = summaries[0];
  const source = series[0]?.source;
  if (!selected || !source) throw new WeatherConditionsUnavailableError();

  const history = periods.map((comparablePeriod, index) => {
    const periodSummary = summaries[index]?.summary;
    if (!periodSummary) throw new WeatherConditionsUnavailableError();
    return {
      year: Number(comparablePeriod.endDate.slice(0, 4)),
      startDate: comparablePeriod.startDate,
      endDate: comparablePeriod.endDate,
      precipitationMm: periodSummary.precipitationMm,
      et0Mm: periodSummary.et0Mm,
      differenceMm: periodSummary.differenceMm,
      precipitationComplete: periodSummary.precipitationComplete,
      et0Complete: periodSummary.et0Complete,
      complete: periodSummary.precipitationComplete && periodSummary.et0Complete,
      selected: index === 0,
    };
  });
  const completeDifferences = history.flatMap(({ differenceMm }) =>
    differenceMm === null ? [] : [differenceMm],
  );
  const selectedComplete = selected.summary.precipitationComplete && selected.summary.et0Complete;
  const allPeriodsComplete = history.every(({ complete }) => complete);
  const comparablePrecipitation = summarizeComparablePrecipitationPrefix(selected.days);
  const comparisonPeriodEndDate = comparablePrecipitation
    ? selected.days[comparablePrecipitation.dayCount - 1]?.date
    : undefined;
  const comparisonPeriod =
    comparablePrecipitation && comparisonPeriodEndDate
      ? {
          startDate: period.startDate,
          endDate: comparisonPeriodEndDate,
          dayCount: comparablePrecipitation.dayCount,
        }
      : null;
  const historicalPrecipitation = comparablePrecipitation
    ? summaries.slice(1).flatMap((entry) => {
        const summary = summarizeWeatherPeriod(
          entry.days.slice(0, comparablePrecipitation.dayCount),
          comparablePrecipitation.dayCount,
        );
        return summary.precipitationComplete && summary.precipitationMm !== null
          ? [summary.precipitationMm]
          : [];
      })
    : [];
  const precipitationReference = comparePrecipitationWithHistory({
    currentMm: comparablePrecipitation?.precipitationMm ?? null,
    currentComplete: comparablePrecipitation !== null,
    historicalValuesMm: historicalPrecipitation,
    comparisonPeriodCount: periods.length - 1,
  });
  const precipitationAggregation = selectPrecipitationAggregation(period.expectedDayCount);
  const precipitationTimeline = comparePrecipitationTimeline({
    selectedDays: comparablePrecipitation
      ? selected.days.slice(0, comparablePrecipitation.dayCount)
      : selected.days,
    historicalSeries: summaries.slice(1).map((entry, index) => ({
      year: Number(periods[index + 1]?.endDate.slice(0, 4)),
      days: entry.days,
    })),
    aggregation: precipitationAggregation,
  });
  const limitations = [
    "Wartości opisują jedną komórkę modelu w punkcie reprezentatywnym działki, a nie bezpośredni pomiar całej jej powierzchni.",
    "ET₀ opisuje referencyjną ewapotranspirację trawy; nie jest zużyciem wody przez wybraną uprawę ani zaleceniem nawadniania.",
    "P − ET₀ nie uwzględnia zapasu wody w glebie, spływu, drenażu, głębokości korzeni ani kondycji uprawy i nie jest diagnozą suszy.",
  ];

  if (source.provider === "NASA POWER") {
    limitations.push(
      "NASA POWER użyto z powodu niedostępności głównego źródła Open-Meteo. Jego siatka jest rzadsza, a najnowsze dane o promieniowaniu mogą pojawiać się później niż dane meteorologiczne.",
    );
  }
  if (!selectedComplete) {
    limitations.push(
      "Wybrany okres jest niepełny. Sumy obejmują tylko dostępne dni, a P − ET₀ pozostaje nieobliczone do czasu uzyskania obu pełnych szeregów.",
    );
  }
  if (comparisonPeriod && comparisonPeriod.dayCount < period.expectedDayCount) {
    limitations.push(
      `Porównanie opadów skrócono do ${comparisonPeriod.endDate}, czyli ostatniego dnia ciągłego szeregu. Każdy rok odniesienia obejmuje ten sam ${comparisonPeriod.dayCount}-dniowy fragment okresu.`,
    );
  }

  return {
    status: selectedComplete && allPeriodsComplete ? "complete" : "partial",
    period,
    summary: selected.summary,
    daily: selected.days,
    precipitationTimeline: {
      aggregation: precipitationAggregation,
      ...precipitationTimeline,
      points: precipitationTimeline.points.map((point) => ({
        ...point,
        ...summarizeSolarRadiationPeriod(selected.days, point.startDate, point.endDate),
      })),
    },
    history,
    precipitationReference: { ...precipitationReference, comparisonPeriod },
    reference: {
      medianDifferenceMm: calculateQuantile(completeDifferences, 0.5),
      q25DifferenceMm: calculateQuantile(completeDifferences, 0.25),
      q75DifferenceMm: calculateQuantile(completeDifferences, 0.75),
      completePeriodCount: completeDifferences.length,
      comparisonPeriodCount: periods.length,
    },
    sample: {
      location: { type: "Point", coordinates: [location[0], location[1]] },
      method: "representative-interior-point",
    },
    source,
    limitations,
  };
}
