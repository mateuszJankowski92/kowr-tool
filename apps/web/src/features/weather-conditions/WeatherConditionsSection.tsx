import type {
  AnalysisDateSelection,
  Crop,
  ParcelResponse,
  WeatherConditionsResponse,
  WeatherPeriodPreset,
} from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  BarController,
  BarElement,
  CategoryScale,
  type ChartData,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { AlertTriangle, CloudRain, History } from "lucide-react";
import { Chart } from "react-chartjs-2";
import { useSearchParams } from "react-router-dom";
import { getWeatherConditions } from "../../api/weather-conditions";
import { RetryButton } from "../../components/RetryButton";
import { parseLocalDate } from "../analysis/analysis-date";
import { ReportSectionHeader } from "../reports/ReportSectionHeader";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
);

const PRESETS: { label: string; value: WeatherPeriodPreset }[] = [
  { label: "Okres analizy", value: "30-days" },
  { label: "Sezon", value: "season" },
];
const millimeterFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

type WeatherConditionsSectionProps = {
  crop: Crop;
  dateSelection: AnalysisDateSelection;
  parcel: ParcelResponse;
};

function formatDate(value: string, pattern = "d MMM"): string {
  return format(parseLocalDate(value), pattern, { locale: pl });
}

function formatMillimeters(value: number | null): string {
  return value === null ? "Brak danych" : `${millimeterFormatter.format(value)} mm`;
}

function formatSolarRadiation(value: number | null): string {
  return value === null ? "Brak danych" : `${millimeterFormatter.format(value)} MJ/m²`;
}

function comparisonLabel(data: WeatherConditionsResponse): string {
  const reference = data.precipitationReference;
  const currentMm = data.summary.precipitationMm;
  const differencePercent =
    currentMm !== null && reference.medianMm !== null && reference.medianMm > 0
      ? Math.max(
          1,
          Math.round((Math.abs(currentMm - reference.medianMm) / reference.medianMm) * 100),
        )
      : null;

  switch (reference.classification) {
    case "lower":
      return differencePercent === null
        ? "Mniej opadów niż zwykle"
        : `${differencePercent}% mniej opadów niż mediana`;
    case "typical":
      return "W typowym zakresie";
    case "higher":
      return differencePercent === null
        ? "Więcej opadów niż zwykle"
        : `${differencePercent}% więcej opadów niż mediana`;
    default:
      return "Brak wystarczających danych";
  }
}

function completenessText(data: WeatherConditionsResponse): string {
  const summary = data.summary;
  const comparisonPeriod = data.precipitationReference.comparisonPeriod;
  if (comparisonPeriod && comparisonPeriod.dayCount < summary.expectedDayCount) {
    return `${comparisonPeriod.dayCount} dni · dane do ${formatDate(comparisonPeriod.endDate)}`;
  }
  return summary.precipitationComplete
    ? `Pełne dane · ${summary.expectedDayCount} dni`
    : `${summary.precipitationAvailableDayCount} z ${summary.expectedDayCount} dni · suma może być niepełna`;
}

function comparisonCoverageText(data: WeatherConditionsResponse): string {
  const reference = data.precipitationReference;
  const comparisonPeriod = reference.comparisonPeriod;
  const completeReference = reference.completePeriodCount === reference.comparisonPeriodCount;
  const yearCount = `${reference.completePeriodCount} ${reference.completePeriodCount === 1 ? "roku" : "lat"}`;
  if (comparisonPeriod && comparisonPeriod.dayCount < data.period.expectedDayCount) {
    return completeReference
      ? `Okres ${formatDate(comparisonPeriod.startDate)}–${formatDate(comparisonPeriod.endDate)} · mediana z ${yearCount}.`
      : `Okres ${formatDate(comparisonPeriod.startDate)}–${formatDate(comparisonPeriod.endDate)} · dostępne ${reference.completePeriodCount} z ${reference.comparisonPeriodCount} lat.`;
  }
  return completeReference
    ? `Mediana z ${yearCount}.`
    : `Dostępne ${reference.completePeriodCount} z ${reference.comparisonPeriodCount} lat.`;
}

function timelineLabel(
  point: WeatherConditionsResponse["precipitationTimeline"]["points"][number],
  aggregation: WeatherConditionsResponse["precipitationTimeline"]["aggregation"],
): string {
  if (aggregation === "daily") return formatDate(point.startDate);
  if (aggregation === "monthly") return formatDate(point.startDate, "MMM yyyy");
  return `${formatDate(point.startDate)}–${formatDate(point.endDate)}`;
}

function timelineRangeLabel(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (startDate === endDate) return format(start, "d MMMM yyyy", { locale: pl });
  if (sameMonth) {
    return `${format(start, "d", { locale: pl })}–${format(end, "d MMMM yyyy", { locale: pl })}`;
  }
  if (sameYear) {
    return `${format(start, "d MMMM", { locale: pl })} – ${format(end, "d MMMM yyyy", { locale: pl })}`;
  }
  return `${format(start, "d MMMM yyyy", { locale: pl })} – ${format(end, "d MMMM yyyy", { locale: pl })}`;
}

function formatDifference(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${millimeterFormatter.format(Math.abs(value))} mm`;
}

function timelineComparisonSummary(data: WeatherConditionsResponse): string {
  const timeline = data.precipitationTimeline;
  if (timeline.comparablePointCount === 0) {
    return "Brakuje wystarczających danych do wiarygodnego porównania opadów z poprzednimi latami.";
  }
  return `W ${timeline.lowerThanHistoricalMedianCount} z ${timeline.comparablePointCount} porównywalnych przedziałów suma opadów była niższa od mediany z poprzednich lat.`;
}

function PrecipitationChart({ data }: { data: WeatherConditionsResponse }) {
  const { aggregation, points } = data.precipitationTimeline;
  const chartPeriod = data.precipitationReference.comparisonPeriod ?? data.period;
  const aggregationLabel =
    aggregation === "daily"
      ? "Opady dzienne"
      : aggregation === "weekly"
        ? "Opady w kolejnych przedziałach siedmiodniowych"
        : "Opady zsumowane w miesiącach";
  const chartData: ChartData<"bar" | "line", (number | null)[], string> = {
    labels: points.map((point) => timelineLabel(point, aggregation)),
    datasets: [
      {
        type: "bar",
        label: "Aktualny okres",
        data: points.map(({ precipitationMm }) => precipitationMm),
        backgroundColor: "rgba(2, 132, 199, 0.78)",
        borderColor: "rgb(3, 105, 161)",
        borderWidth: 1,
        borderRadius: { topLeft: 6, topRight: 6 },
        borderSkipped: "bottom",
        maxBarThickness: 28,
      },
      {
        type: "bar",
        label: "Mediana z poprzednich 10 lat",
        data: points.map(({ historicalMedianMm }) => historicalMedianMm),
        backgroundColor: "rgba(71, 85, 105, 0.34)",
        borderColor: "rgb(71, 85, 105)",
        borderWidth: 1,
        borderRadius: { topLeft: 6, topRight: 6 },
        borderSkipped: "bottom",
        maxBarThickness: 28,
      },
      {
        type: "line",
        label: "Promieniowanie słoneczne",
        data: points.map(({ solarRadiationMjPerM2 }) => solarRadiationMjPerM2),
        yAxisID: "solar",
        borderColor: "rgb(161, 98, 7)",
        backgroundColor: "rgb(161, 98, 7)",
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        spanGaps: false,
        order: -1,
      },
    ],
  };
  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        display: true,
        align: "start",
        labels: { boxHeight: 10, boxWidth: 10, padding: 18, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const point = points[items[0]?.dataIndex ?? -1];
            return point ? timelineRangeLabel(point.startDate, point.endDate) : "";
          },
          label: (context) =>
            context.datasetIndex === 0
              ? `Opady: ${formatMillimeters(context.parsed.y)}`
              : context.datasetIndex === 1
                ? `Mediana historyczna: ${formatMillimeters(context.parsed.y)}`
                : `Promieniowanie słoneczne: ${formatSolarRadiation(context.parsed.y)}`,
          footer: (items) => {
            if (items.every((item) => item.datasetIndex === 2)) return "";
            const point = points[items[0]?.dataIndex ?? -1];
            if (!point) return "";
            const lines = [
              point.historicalCompletePeriodCount === point.historicalComparisonPeriodCount
                ? `Porównanie: mediana z ${point.historicalCompletePeriodCount} lat`
                : `Porównanie: dostępne ${point.historicalCompletePeriodCount} z ${point.historicalComparisonPeriodCount} lat`,
            ];
            if (point.differenceFromHistoricalMedianMm !== null) {
              lines.unshift(`Różnica: ${formatDifference(point.differenceFromHistoricalMedianMm)}`);
            }
            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: false,
        grid: { display: false },
        ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 14 },
      },
      y: {
        beginAtZero: true,
        stacked: false,
        grid: { color: "rgba(71, 85, 105, 0.12)" },
        title: { display: true, text: "Opady · mm" },
      },
      solar: {
        type: "linear",
        position: "right",
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        title: { display: true, text: "Promieniowanie · MJ/m²" },
      },
    },
  };
  const incompletePointCount = points.filter(({ complete }) => !complete).length;
  const unavailableMedianCount = points.filter(
    ({ historicalMedianMm }) => historicalMedianMm === null,
  ).length;
  const incompleteSolarPointCount = points.filter(
    (point) => point.solarRadiationAvailableDayCount < point.expectedDayCount,
  ).length;
  const chartMinWidth = Math.max(640, points.length * 42);

  return (
    <figure aria-labelledby="precipitation-chart-title" className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-semibold" id="precipitation-chart-title">
            Jak zmieniały się opady i nasłonecznienie?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{aggregationLabel}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDate(chartPeriod.startDate, "d MMM yyyy")} –{" "}
          {formatDate(chartPeriod.endDate, "d MMM yyyy")}
        </p>
      </div>
      <section
        aria-label="Przewijany wykres opadów i promieniowania słonecznego"
        className="mt-4 overflow-x-auto pb-2"
      >
        <div
          aria-label="Opady, mediana historyczna opadów i promieniowanie słoneczne w analizowanym okresie"
          className="weather-chart w-full"
          role="img"
          style={{ minWidth: `${chartMinWidth}px` }}
        >
          <Chart data={chartData} options={options} type="bar" />
        </div>
      </section>
      {(incompletePointCount > 0 || unavailableMedianCount > 0) && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {incompletePointCount > 0 &&
            `${incompletePointCount} ${incompletePointCount === 1 ? "przedział nie ma" : "przedziały nie mają"} pełnych danych opadowych. `}
          {unavailableMedianCount > 0 &&
            `${unavailableMedianCount} ${unavailableMedianCount === 1 ? "mediana jest" : "mediany są"} niedostępne z powodu mniej niż 5 kompletnych lat.`}
        </p>
      )}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Żółta linia pokazuje sumę energii słonecznej docierającej do powierzchni w danym przedziale
        (prawa oś, MJ/m²). To nie indeks UV ani liczba godzin słonecznych.
      </p>
      {incompleteSolarPointCount > 0 && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">
          {incompleteSolarPointCount === points.length
            ? "Brak pełnych danych o promieniowaniu słonecznym dla pokazanych przedziałów."
            : `Niepełne dane o promieniowaniu słonecznym: ${incompleteSolarPointCount} z ${points.length} przedziałów. Luki w linii oznaczają brak danych.`}
        </p>
      )}
      <p className="mt-3 text-sm font-medium leading-6">{timelineComparisonSummary(data)}</p>
    </figure>
  );
}

function DailyDataTable({ data }: { data: WeatherConditionsResponse }) {
  return (
    <div className="mt-5 max-h-80 overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-secondary">
          <tr>
            <th className="p-3">Data</th>
            <th className="p-3">Opady</th>
            <th className="p-3">ET₀</th>
            <th className="p-3">Promieniowanie słoneczne</th>
            <th className="p-3">Śr. temperatura</th>
          </tr>
        </thead>
        <tbody>
          {data.daily.map((day) => (
            <tr className="border-t border-border" key={day.date}>
              <th className="p-3 font-medium">{formatDate(day.date, "d MMM yyyy")}</th>
              <td className="p-3 tabular-nums">{formatMillimeters(day.precipitationMm)}</td>
              <td className="p-3 tabular-nums">{formatMillimeters(day.et0Mm)}</td>
              <td className="p-3 tabular-nums">
                {formatSolarRadiation(day.solarRadiationMjPerM2)}
              </td>
              <td className="p-3 tabular-nums">
                {day.temperatureMeanCelsius === null
                  ? "Brak danych"
                  : `${millimeterFormatter.format(day.temperatureMeanCelsius)}°C`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MethodologyDetails({ data }: { data: WeatherConditionsResponse }) {
  return (
    <div className="source-details">
      <div className="source-sections">
        <dl className="source-facts">
          <div>
            <dt className="text-muted-foreground">Referencyjna ewapotranspiracja ET₀</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {formatMillimeters(data.summary.et0Mm)}
            </dd>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Dostępne dni: {data.summary.et0AvailableDayCount} z {data.summary.expectedDayCount}.
              ET₀ opisuje zapotrzebowanie atmosferyczne dla dobrze nawodnionej trawy referencyjnej.
            </p>
          </div>
          <div>
            <dt className="text-muted-foreground">Meteorologiczna różnica P − ET₀</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {formatMillimeters(data.summary.differenceMm)}
            </dd>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              To uproszczony wskaźnik meteorologiczny, nie ilość wody w glebie, diagnoza suszy ani
              dawka nawadniania.
            </p>
          </div>
        </dl>
        <dl className="source-facts">
          <div>
            <dt className="font-medium text-foreground">Dostawca i produkt</dt>
            <dd>
              <a
                className="underline decoration-border underline-offset-4 hover:text-foreground"
                href={data.source.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {data.source.provider} · {data.source.dataset}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Model i rozdzielczość</dt>
            <dd>
              {data.source.model} · {data.source.spatialResolution}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Okres i kompletność</dt>
            <dd>
              {data.period.startDate} – {data.period.endDate} · opady{" "}
              {data.summary.precipitationAvailableDayCount}/{data.summary.expectedDayCount}, ET₀{" "}
              {data.summary.et0AvailableDayCount}/{data.summary.expectedDayCount}
            </dd>
          </div>
          {data.precipitationReference.comparisonPeriod && (
            <div>
              <dt className="font-medium text-foreground">Zakres porównania opadów</dt>
              <dd>
                {data.precipitationReference.comparisonPeriod.startDate} –{" "}
                {data.precipitationReference.comparisonPeriod.endDate} ·{" "}
                {data.precipitationReference.comparisonPeriod.dayCount} dni
              </dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-foreground">Czas danych, pobranie i licencja</dt>
            <dd>
              {data.source.timeStandard} · pobrano{" "}
              {new Intl.DateTimeFormat("pl-PL", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(data.source.retrievedAt))}
              {" · "}
              {data.source.license}
            </dd>
          </div>
        </dl>
      </div>
      <ul className="mt-5 list-disc space-y-2 pl-5 text-muted-foreground">
        {data.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
      <DailyDataTable data={data} />
    </div>
  );
}

export function WeatherConditionsSection({
  crop,
  dateSelection,
  parcel,
}: WeatherConditionsSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsedPreset = searchParams.get("weatherPeriod");
  const preset = PRESETS.some(({ value }) => value === parsedPreset)
    ? (parsedPreset as WeatherPeriodPreset)
    : "30-days";
  const query = useQuery({
    queryKey: ["weather-conditions", parcel.identifier, crop, dateSelection, preset],
    queryFn: ({ signal }) =>
      getWeatherConditions(
        {
          geometry: parcel.geometry,
          crop,
          dateSelection,
          periodPreset: dateSelection.type === "day" ? preset : undefined,
        },
        signal,
      ),
    retry: false,
    staleTime: 30 * 60 * 1000,
  });

  function selectPreset(value: WeatherPeriodPreset) {
    const next = new URLSearchParams(searchParams);
    next.set("weatherPeriod", value);
    setSearchParams(next, { replace: true });
  }

  return (
    <section
      aria-labelledby="weather-conditions-title"
      className="weather-conditions rounded-2xl bg-background p-5 md:p-6"
    >
      <ReportSectionHeader
        description="Sprawdź, ile padało w okolicy Twojej działki i jak ten okres wypada na tle poprzednich lat."
        icon={CloudRain}
        id="weather-conditions-title"
        source={
          query.data
            ? {
                content: <MethodologyDetails data={query.data} />,
                description:
                  "Pochodzenie danych pogodowych, kompletność okresu, ograniczenia i wartości dzienne.",
                title: "Źródła i metodologia danych pogodowych",
              }
            : undefined
        }
        status={
          dateSelection.type === "day" ? (
            <fieldset
              aria-label="Okres danych pogodowych"
              className="flex flex-wrap rounded-lg border-0 bg-secondary p-1"
            >
              {PRESETS.map((option) => (
                <button
                  aria-pressed={preset === option.value}
                  className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${preset === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  key={option.value}
                  onClick={() => selectPreset(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
          ) : undefined
        }
        title="Opady i warunki pogodowe"
      />

      {query.isPending ? (
        <div aria-label="Pobieranie danych pogodowych" className="mt-7" role="status">
          <div className="h-12 w-full max-w-2xl animate-pulse rounded-lg bg-secondary" />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="h-32 animate-pulse rounded-xl bg-secondary" />
            <div className="h-32 animate-pulse rounded-xl bg-secondary" />
          </div>
          <div className="mt-6 h-80 animate-pulse rounded-xl bg-secondary" />
        </div>
      ) : query.isError ? (
        <div
          className="mt-7 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-amber-950"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Nie udało się pobrać danych pogodowych</p>
            <p className="mt-1 text-sm leading-5">
              Nie otrzymaliśmy poprawnego wyniku. Pozostałe części raportu nadal działają.
            </p>
            <RetryButton
              className="mt-3"
              isRetrying={query.isFetching}
              onRetry={() => void query.refetch()}
            >
              Spróbuj ponownie
            </RetryButton>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl bg-sky-50 p-4 text-sky-950">
              <div className="flex items-center gap-2 text-sm font-medium text-sky-800">
                <CloudRain aria-hidden="true" className="size-4" />
                Suma opadów
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] tabular-nums">
                {formatMillimeters(query.data.summary.precipitationMm)}
              </p>
              <p className="mt-1 text-xs leading-5 text-sky-800">{completenessText(query.data)}</p>
            </article>
            <article className="rounded-xl bg-secondary p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <History aria-hidden="true" className="size-4" />
                Na tle poprzednich lat
              </div>
              <p className="mt-4 text-lg font-semibold tracking-[-0.02em]">
                {comparisonLabel(query.data)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {comparisonCoverageText(query.data)}
              </p>
            </article>
          </div>

          <PrecipitationChart data={query.data} />
          <section
            aria-label="Źródła i metodologia danych pogodowych"
            className="mt-5 hidden border-t border-border pt-5 print:block"
          >
            <h3 className="mb-3 text-sm font-semibold">Źródła i metodologia</h3>
            <MethodologyDetails data={query.data} />
          </section>
        </>
      )}
    </section>
  );
}
