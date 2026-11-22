import type { Crop, HistoricalWaterAssessmentResponse } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  BarElement,
  CategoryScale,
  type ChartData,
  Chart as ChartJS,
  type ChartOptions,
  LinearScale,
  Tooltip,
} from "chart.js";
import { CircleDashed, Database, History, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Bar } from "react-chartjs-2";
import {
  createHistoricalWaterAssessmentRequest,
  getHistoricalWaterAssessment,
} from "../../api/historical-analyses";
import { RetryButton } from "../../components/RetryButton";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { CropModelNotice } from "./CropModelNotice";
import { ReportSectionHeader } from "./ReportSectionHeader";
import { useReportPrint } from "./report-print-context";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

type HistoricalResult = HistoricalWaterAssessmentResponse;
type HistoricalSeason = HistoricalResult["seasons"][number];
type HistoricalLimitation = HistoricalResult["limitations"][number];
type NumericRange = { minimum: number; maximum: number };

const LIMITATION_LABELS: Record<HistoricalLimitation, string> = {
  COUNTERFACTUAL_CURRENT_CROP_PROFILE:
    "Każdy rok symuluje obecnie wybraną uprawę, a nie potwierdzoną uprawę historyczną.",
  HISTORICAL_CROP_ROTATION_NOT_CONFIRMED:
    "Nie znamy rzeczywistego płodozmianu działki w analizowanych latach.",
  CURRENT_PARCEL_GEOMETRY_USED_FOR_HISTORY:
    "Dla wszystkich okresów wykorzystano obecną granicę działki.",
  CURRENT_SOILGRIDS_MODEL_REUSED_FOR_HISTORY:
    "Ten sam aktualny model SoilGrids wykorzystano dla wszystkich okresów.",
  HISTORICAL_IRRIGATION_RUNOFF_AND_CAPILLARY_RISE_UNKNOWN:
    "Nie znamy historycznego nawadniania, spływu ani podsiąku kapilarnego.",
  MODELLED_SUSCEPTIBILITY_NOT_CONFIRMED_HISTORICAL_LOSS:
    "Modelowany deficyt ewapotranspiracji nie oznacza potwierdzonej straty plonu.",
  WEATHER_POINT_MODEL: "Pogoda pochodzi z punktu modelu, a nie z pomiaru na działce.",
  WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS:
    "Co najmniej jeden sezon wykorzystuje analizę operacyjną ECMWF IFS. Jest to odrębny model od archiwalnego ERA5, aktualizowany w czasie.",
  SCENARIO_RANGES_ARE_NOT_CONFIDENCE_INTERVALS:
    "Zakresy scenariuszy pokazują wpływ założeń i nie są przedziałami ufności.",
};

const INCOMPLETE_REASON_LABELS: Record<string, string> = {
  CROP_PROFILE_UNSUPPORTED:
    "Ta pozycja katalogu nie opisuje rośliny polowej. Bilans FAO-56 strefy korzeniowej nie ma tu zastosowania.",
  PHENOLOGY_REFERENCE_UNAVAILABLE: "Brak referencyjnego przebiegu faz rozwoju tej uprawy.",
  ANALYSIS_OUTSIDE_MODELED_SEASON: "Data analizy wypada poza modelowanym okresem uprawy.",
  ANALYSIS_AFTER_MODELED_SEASON:
    "Data analizy wypada po końcu co najmniej jednego wymaganego wariantu sezonu.",
  ANALYSIS_BEFORE_SEASON:
    "Data analizy wypada przed początkiem co najmniej jednego wymaganego wariantu sezonu.",
  SOIL_PROFILE_UNAVAILABLE: "Nie udało się pobrać wymaganych danych SoilGrids.",
  SOIL_PROFILE_INCOMPLETE: "Profil SoilGrids nie zawiera wszystkich wymaganych wartości.",
  WEATHER_UNAVAILABLE: "Dla tego roku nie udało się pobrać pogody.",
  WEATHER_SERIES_INCOMPLETE: "Historyczny szereg pogodowy jest niepełny.",
  MISSING_WEATHER_DAY: "W szeregu pogodowym brakuje wymaganego dnia.",
  MISSING_WEATHER_VALUE: "Dla wymaganego dnia brakuje opadu lub ET₀.",
  MISSING_SOIL_VALUE: "Brakuje wymaganej wartości retencji gleby w strefie korzeniowej.",
  ROOT_DEPTH_OUTSIDE_SOIL_PROFILE:
    "Modelowana strefa korzeniowa wykracza poza dostępny profil gleby.",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits }).format(value);
}

function formatRange(range: NumericRange | null, unit: string, maximumFractionDigits = 0): string {
  if (!range) return "Brak danych";
  const minimum = formatNumber(range.minimum, maximumFractionDigits);
  const maximum = formatNumber(range.maximum, maximumFractionDigits);
  return range.minimum === range.maximum ? `${minimum} ${unit}` : `${minimum}–${maximum} ${unit}`;
}

function initialConditionLabel(
  sensitivity: HistoricalSeason["initialConditionSensitivity"],
): string {
  switch (sensitivity.classification) {
    case "no-material-influence":
      return "Wyniki par wariantów mokrego i suchego początku były zgodne.";
    case "dry-start-only":
      return "Ograniczenie pojawiało się tylko w wariancie skrajnie suchego początku.";
    case "material":
      return "Wynik jest wrażliwy na nieznaną ilość wody w glebie na początku okresu.";
    default:
      return "Nie udało się ocenić wpływu początkowej ilości wody w glebie.";
  }
}

function uniqueIncompleteReasons(result: HistoricalResult): string[] {
  return [
    ...new Set(result.seasons.flatMap(({ incompleteReasonCodes }) => incompleteReasonCodes)),
  ].map((code) => INCOMPLETE_REASON_LABELS[code] ?? `Brak danych: ${code}.`);
}

function conclusionLabel(conclusion: HistoricalSeason["conclusion"]): string {
  switch (conclusion) {
    case "modelled-stress":
      return "zgodne wskazanie we wszystkich wariantach";
    case "ambiguous":
      return "wynik zależny od założeń";
    case "no-modelled-stress":
      return "brak ograniczenia we wszystkich wariantach";
    default:
      return "brak kompletnych danych";
  }
}

function historicalSummary(summary: HistoricalResult["summary"]): string {
  const categories = [
    {
      count: summary.seasonsWithModelledStress,
      description:
        "wszystkie warianty wskazują co najmniej jeden dzień ograniczenia poboru wody przez uprawę.",
    },
    {
      count: summary.ambiguousSeasonCount,
      description:
        "wynik zależy od przyjętych założeń: część wariantów wskazuje co najmniej jeden dzień ograniczenia poboru wody przez uprawę, a część nie wskazuje takiego dnia.",
    },
    {
      count: summary.seasonsWithoutModelledStress,
      description: "żaden wariant nie wskazuje ograniczenia poboru wody przez uprawę.",
    },
  ];

  return categories
    .filter(({ count }) => count > 0)
    .map(({ count, description }) => {
      const period =
        count === summary.completeSeasonCount
          ? count === 1
            ? "W jedynym roku z kompletnymi danymi"
            : `We wszystkich ${count} latach z kompletnymi danymi`
          : `W ${count} z ${summary.completeSeasonCount} lat z kompletnymi danymi`;
      return `${period} ${description}`;
    })
    .join(" ");
}

function HistoricalStressDaysChart({ seasons }: { seasons: HistoricalResult["seasons"] }) {
  const ordered = [...seasons].sort((left, right) => left.referenceYear - right.referenceYear);
  const values = ordered.map((season): [number, number] | null =>
    season.scenarios.completeCount > 0 && season.stressDays
      ? [season.stressDays.minimum, season.stressDays.maximum]
      : null,
  );
  const chartData: ChartData<"bar", ([number, number] | null)[], string> = {
    labels: ordered.map(({ referenceYear }) => String(referenceYear)),
    datasets: [
      {
        data: values,
        backgroundColor: ordered.map((season) => {
          if (season.status === "incomplete") return "rgba(105, 115, 108, 0.65)";
          if (season.conclusion === "modelled-stress") return "rgba(112, 78, 54, 0.86)";
          if (season.conclusion === "ambiguous") return "rgba(180, 137, 66, 0.82)";
          return "rgba(65, 119, 82, 0.76)";
        }),
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.68,
        minBarLength: 4,
      },
    ],
  };
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `Rok ${items[0]?.label ?? ""}`,
          label: (context) => {
            const season = ordered[context.dataIndex];
            if (!season || season.scenarios.completeCount === 0) return "Brak kompletnych danych";
            return [
              `${formatDate(season.periodStartDate)} – ${formatDate(season.periodEndDate)}`,
              `Dni ograniczenia: ${formatRange(season.stressDays, "dni")}`,
              `Deficyt ET: ${formatRange(season.cumulativeEvapotranspirationDeficitMm, "mm", 1)}`,
              `Warianty: ${conclusionLabel(season.conclusion)}`,
              `Kompletność pogody: ${season.weather.completeDayCount}/${season.weather.expectedDayCount} dni`,
              initialConditionLabel(season.initialConditionSensitivity),
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { autoSkip: false, color: "#526157", font: { size: 10 }, maxRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(74, 91, 80, 0.12)" },
        ticks: { color: "#526157", precision: 0 },
        title: { display: true, text: "Liczba dni", color: "#526157" },
      },
    },
  };

  return (
    <figure aria-labelledby="historical-chart-title" className="mt-7">
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.015em]" id="historical-chart-title">
          Ile dni uprawa mogła odczuwać niedobór wody?
        </h3>
        <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
          Zakres wyników modelu dla różnych założeń dotyczących gleby i rozwoju uprawy.
        </p>
      </div>
      <div
        aria-label="Zakres liczby dni ograniczenia poboru wody według roku"
        className="mt-4 h-72 sm:h-80"
        role="img"
      >
        <Bar data={chartData} options={options} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#417752]"
          />
          bez ograniczenia
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#b48942]"
          />
          zależne od założeń
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#704e36]"
          />
          zgodne wskazanie
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-2.5 rounded-sm border border-dashed border-muted-foreground"
          />
          wynik części wariantów lub brak danych
        </span>
      </div>
      <Alert className="mt-3">
        <Info aria-hidden="true" />
        <AlertDescription>
          Każdy słupek pokazuje minimum i maksimum w rozpatrywanych wariantach, a nie przedział
          ufności. Szczegóły poszczególnych lat można rozwinąć poniżej wykresu.
        </AlertDescription>
      </Alert>
    </figure>
  );
}

type HistoricalSusceptibilitySectionProps = {
  analysisDate: string;
  crop: Crop;
  parcelIdentifier: string;
  seasonStartDate?: string;
};

export function HistoricalSusceptibilitySection({
  analysisDate,
  crop,
  parcelIdentifier,
  seasonStartDate,
}: HistoricalSusceptibilitySectionProps) {
  const request = createHistoricalWaterAssessmentRequest({
    analysisDate,
    crop,
    parcelIdentifier,
    seasonStartDate,
  });
  const assessmentQuery = useQuery({
    queryKey: [
      "historical-water-assessment",
      parcelIdentifier,
      crop,
      analysisDate,
      seasonStartDate,
    ],
    queryFn: ({ signal }) => getHistoricalWaterAssessment(request, signal),
    retry: false,
    staleTime: 30 * 60 * 1_000,
    gcTime: 60 * 60 * 1_000,
    refetchOnWindowFocus: false,
  });

  if (assessmentQuery.isPending) {
    return (
      <SectionShell busy>
        <SectionHeader />
        <div className="mt-5" role="status">
          <div className="h-24 animate-pulse rounded-xl bg-secondary" />

          <span className="sr-only">Trwa porównywanie dziesięciu poprzednich lat.</span>
        </div>
      </SectionShell>
    );
  }

  if (assessmentQuery.isError) {
    return (
      <SectionShell>
        <SectionHeader />
        <div className="mt-5 rounded-xl bg-destructive/10 p-4" role="alert">
          <h3 className="font-semibold">Nie udało się porównać poprzednich lat</h3>
          <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
            Zapytanie historyczne nie zwróciło poprawnego wyniku. Bieżąca ocena działa niezależnie.
          </p>
          <RetryButton
            className="mt-2"
            isRetrying={assessmentQuery.isFetching}
            onRetry={() => void assessmentQuery.refetch()}
          >
            Ponów analizę
          </RetryButton>
        </div>
      </SectionShell>
    );
  }

  const result = assessmentQuery.data;
  const incompleteReasons = uniqueIncompleteReasons(result);
  if (
    result.summary.completeSeasonCount === 0 &&
    !result.seasons.some((season) => season.scenarios.completeCount > 0)
  ) {
    return (
      <SectionShell>
        <SectionHeader result={result} status={<CompletenessStatus result={result} />} />
        <EmptyState
          description="Żadnego z dziesięciu okresów nie udało się obliczyć we wszystkich wymaganych wariantach. Niekompletnych lat nie potraktowano jako lat bez ograniczenia."
          title="Za mało danych do porównania historycznego"
        />
        <ReasonList reasons={incompleteReasons} />
        {result.seasons.some((season) =>
          season.incompleteReasonCodes.some((reason) =>
            ["WEATHER_UNAVAILABLE", "SOIL_PROFILE_UNAVAILABLE"].includes(reason),
          ),
        ) && (
          <RetryButton
            className="mt-2"
            isRetrying={assessmentQuery.isFetching}
            onRetry={() => void assessmentQuery.refetch()}
          >
            Ponów analizę
          </RetryButton>
        )}
      </SectionShell>
    );
  }

  return (
    <HistoricalResultContent
      key={`${result.parcel.identifier}-${result.crop.arimrId}-${result.analysisDate}`}
      result={result}
    />
  );
}

function HistoricalResultContent({ result }: { result: HistoricalResult }) {
  const print = useReportPrint();
  return (
    <SectionShell>
      <SectionHeader result={result} status={<CompletenessStatus result={result} />} />
      <CropModelNotice kind={result.crop.modelKind} />
      {result.evaluation?.scope === "completed-season" && (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Porównujemy wspólny modelowany okres zakończonej uprawy do{" "}
          {formatDate(result.evaluation.evaluatedThroughDate)}, przesunięty do poprzednich lat. Nie
          porównujemy listopadowego stanu gleby po zbiorach.
        </p>
      )}
      {result.summary.completeSeasonCount > 0 ? (
        <p className="mt-4 max-w-[75ch] text-sm leading-6">{historicalSummary(result.summary)}</p>
      ) : (
        <p className="mt-4 text-sm leading-6">
          Dostępne są wyniki części wariantów w poszczególnych latach. Nie wystarczają do wyliczenia
          częstości dla całych sezonów.
        </p>
      )}
      {result.status === "partial" && (
        <p className="mt-2 text-sm leading-6 text-muted-foreground" role="status">
          Wynik częściowy: pominięto {result.summary.incompleteSeasonCount} niekompletnych lat. Brak
          danych nie oznacza braku ograniczenia poboru wody.
        </p>
      )}
      <details
        className="print-history-comparison mt-5 border-t border-border pt-4"
        open={print ? true : undefined}
      >
        <summary className="min-h-10 cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Porównaj poszczególne lata
        </summary>
        <HistoricalStressDaysChart seasons={result.seasons} />
        <div
          className={`mt-5 divide-y divide-border border-t border-border ${print?.variant === "simple" ? "print-extended-only" : ""}`}
        >
          {result.seasons.map((season) => (
            <details key={season.referenceYear}>
              <summary className="min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="font-semibold">{season.referenceYear}</span>
                <span className="ml-3 text-muted-foreground">
                  {conclusionLabel(season.conclusion)}
                </span>
              </summary>
              <div className="pb-4 text-sm leading-6">
                <p className="mt-1 text-muted-foreground">
                  {formatDate(season.periodStartDate)}–{formatDate(season.periodEndDate)} · Pogoda:{" "}
                  {season.weather.completeDayCount}/{season.weather.expectedDayCount} dni.
                </p>
                {season.scenarios.completeCount > 0 ? (
                  <>
                    {season.status === "incomplete" && (
                      <p className="mt-2 text-muted-foreground">
                        Ukończono {season.scenarios.completeCount} z {season.scenarios.totalCount}{" "}
                        wariantów. Zakres dotyczy tylko tej części; brakujące warianty mogą zmienić
                        wniosek.
                      </p>
                    )}
                    <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <dt>Dni ograniczenia</dt>
                        <dd className="font-semibold">{formatRange(season.stressDays, "dni")}</dd>
                      </div>
                      <div>
                        <dt>Deficyt ET</dt>
                        <dd className="font-semibold">
                          {formatRange(season.cumulativeEvapotranspirationDeficitMm, "mm", 1)}
                        </dd>
                      </div>
                      <div>
                        <dt>Najdłuższy epizod</dt>
                        <dd className="font-semibold">
                          {formatRange(season.longestStressEpisodeDaysRange, "dni")}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-muted-foreground">
                      {initialConditionLabel(season.initialConditionSensitivity)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Skrajnie suchy początek jest testem wrażliwości, a nie odtworzeniem
                      rzeczywistej wilgotności gleby w tym roku.
                    </p>
                  </>
                ) : (
                  <ReasonList
                    reasons={season.incompleteReasonCodes.map(
                      (code) => INCOMPLETE_REASON_LABELS[code] ?? `Brak danych: ${code}.`,
                    )}
                  />
                )}
              </div>
            </details>
          ))}
        </div>
      </details>
      <ReasonList reasons={uniqueIncompleteReasons(result)} />
    </SectionShell>
  );
}

function CompletenessStatus({ result }: { result: HistoricalResult }) {
  return (
    <Badge
      className="tabular-nums"
      variant={
        result.summary.completeSeasonCount === result.summary.requiredSeasonCount
          ? "success"
          : "warning"
      }
    >
      {result.summary.completeSeasonCount} z {result.summary.requiredSeasonCount} lat
    </Badge>
  );
}

function SectionShell({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <section
      aria-busy={busy || undefined}
      aria-labelledby="historical-susceptibility-title"
      aria-live="polite"
      className="rounded-2xl bg-card p-5 shadow-[0_14px_38px_rgba(15,37,25,0.10)] sm:p-6"
    >
      {children}
    </section>
  );
}

function EmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4 sm:p-5">
      <CircleDashed aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Dlaczego część danych jest niekompletna?</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
        {reasons.slice(0, 4).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ result, status }: { result?: HistoricalResult; status?: ReactNode }) {
  return (
    <ReportSectionHeader
      description="Sprawdź, jak wybrana uprawa mogłaby reagować na pogodę z poprzednich 10 lat."
      icon={History}
      id="historical-susceptibility-title"
      source={
        result
          ? {
              content: <HistoricalSourceDetails result={result} />,
              description: "Sposób porównania, źródła danych i ograniczenia interpretacji.",
              title: "Źródła i metoda porównania historycznego",
            }
          : undefined
      }
      status={status}
      title="Uprawa na tle poprzednich lat"
    />
  );
}

function HistoricalSourceDetails({ result }: { result: HistoricalResult }) {
  const seasonStartDate = result.phenology?.seasonStartDates[0];
  const weatherSources = [
    ...new Map(
      result.seasons.flatMap(({ weather }) =>
        weather.source ? [[weather.source.provider, weather.source] as const] : [],
      ),
    ).values(),
  ];
  return (
    <div className="source-details source-sections">
      <div>
        <h3 className="font-semibold text-foreground">Metoda</h3>
        <p className="mt-2">
          Ten sam profil FAO-56 i analogiczny okres, rozpoczęty{" "}
          {seasonStartDate ? formatDate(seasonStartDate) : "w standardowym terminie dla uprawy"},
          przesunięto o 1–10 pełnych lat. Dla każdej pogody obliczono warianty właściwości gleby,
          rozwoju uprawy oraz mokrego i skrajnie suchego początku.
        </p>
        <p className="mt-2">
          Przyjęty profil: {result.crop.profileLabel ?? result.crop.profileId ?? "nie dotyczy"}.
        </p>
        {result.crop.profileAssumptions && (
          <ul className="mt-2 space-y-1.5">
            {result.crop.profileAssumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        )}
        {result.phenology?.referenceSource && (
          <p className="mt-2">
            Źródło długości faz:{" "}
            <a
              className="underline underline-offset-4"
              href={result.phenology.referenceSource.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {result.phenology.referenceSource.provider} ·{" "}
              {result.phenology.referenceSource.dataset}
            </a>{" "}
            (wersja {result.phenology.referenceSource.version}). Referencja spoza Polski nie jest
            lokalną kalibracją ani odtworzeniem historycznej fenologii działki.
            {result.phenology.referenceSource.adaptation && (
              <>
                {" "}
                Proporcje faz przeskalowano do 317–335 dni sezonu na podstawie badań w
                północno-wschodniej Polsce. To jawne scenariusze projektu, a nie pomiar faz rozwoju.
              </>
            )}
          </p>
        )}
        <p className="mt-2">
          Scenariusze nie mają przypisanych prawdopodobieństw. Pokazywane minimum i maksimum to
          zakres rozpatrywanych wariantów, nie przedział ufności ani prognoza najbardziej
          prawdopodobnego wyniku.
        </p>
        <p className="mt-2">
          Zakres danych:{" "}
          {result.summary.actualDataPeriod
            ? `${formatDate(result.summary.actualDataPeriod.from)}–${formatDate(result.summary.actualDataPeriod.to)}`
            : "brak kompletnego okresu"}
          .
        </p>
      </div>
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Database aria-hidden="true" className="size-4" /> Źródła danych
        </h3>
        <ul className="source-records mt-2">
          {weatherSources.map((source) => (
            <li key={`${source.provider}-${source.retrievedAt}`}>
              <span className="block font-medium text-foreground">{source.provider}</span>
              {` · ${source.dataset} · ${source.model} · ${source.spatialResolution} · pobrano ${formatTimestamp(source.retrievedAt)}`}
            </li>
          ))}
          <li>
            <span className="block font-medium text-foreground">
              {result.soil.source?.provider ?? "ISRIC"}
            </span>
            {result.soil.source
              ? ` · ${result.soil.source.dataset} · pobrano ${formatTimestamp(result.soil.source.retrievedAt)}`
              : " · profil gleby niedostępny"}
          </li>
        </ul>
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-foreground">Ograniczenia interpretacji</h3>
        <ul className="mt-2 space-y-1.5">
          {result.limitations.map((limitation) => (
            <li key={limitation}>{LIMITATION_LABELS[limitation]}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
