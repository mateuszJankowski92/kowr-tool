import type {
  Crop,
  ParcelResponse,
  SatelliteCombinedObservation,
  SatelliteObservationSummaryResponse,
  WaterAssessmentResponse,
} from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { AlertTriangle, CalendarDays, Satellite } from "lucide-react";
import { createWaterAssessmentRequest, getWaterAssessment } from "../../api/analyses";
import { ApiClientError } from "../../api/request-json";
import { getSatelliteObservationSummary } from "../../api/satellite-history";
import { RetryButton } from "../../components/RetryButton";
import { Badge } from "../../components/ui/badge";
import { Spinner } from "../../components/ui/spinner";
import { parseLocalDate } from "../analysis/analysis-date";
import { ReportSectionHeader } from "../reports/ReportSectionHeader";
import { VegetationHistoryChart } from "./VegetationHistoryChart";

const STALE_OBSERVATION_DAYS = 14;

type SatelliteObservationsCardProps = {
  seasonStartDate?: string;
  crop?: Crop;
  cropLabel: string;
  parcel: ParcelResponse;
  throughDate: string;
};

const percentFormatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });

function formatObservationDate(value: string): string {
  return format(parseLocalDate(value), "d MMM yyyy", { locale: pl });
}

function formatRetrievedAt(value: string): string {
  return format(new Date(value), "d MMM yyyy, HH:mm", { locale: pl });
}

function differenceInCalendarDays(later: string, earlier: string): number {
  const laterTime = Date.parse(`${later}T00:00:00.000Z`);
  const earlierTime = Date.parse(`${earlier}T00:00:00.000Z`);
  return Math.round((laterTime - earlierTime) / 86_400_000);
}

function getValidPixelPercent(observation: SatelliteCombinedObservation): number | null {
  return observation.indicators.ndmi.validPixelPercent;
}

function getQualityThreshold(observation: SatelliteCombinedObservation): number | null {
  return observation.indicators.ndmi.quality?.thresholdPercent ?? null;
}

function limitationLabel(limitation: string): string {
  const labels: Record<string, string> = {
    "NDVI parcel statistics are unavailable.":
      "Nie udało się pobrać dodatkowego wskaźnika NDVI. Dostępne dane NDMI pozostają na wykresie.",
    "NDMI parcel statistics are unavailable.":
      "Nie udało się pobrać wskaźnika uwodnienia roślinności NDMI. Nie można pokazać jego zmian.",
    "CDSE credentials are not configured; observation dates are available, but parcel statistics are disabled.":
      "Usługa zdjęć satelitarnych nie jest skonfigurowana. Znamy daty zdjęć, ale nie możemy obliczyć wskaźników dla działki.",
    "Parcel statistics are temporarily unavailable; observation dates come from the public CDSE catalogue.":
      "Obliczenie wskaźników dla działki jest chwilowo niedostępne. Znamy jedynie daty zdjęć z katalogu Copernicus.",
  };
  return labels[limitation] ?? limitation;
}

function getTrendSummary(result: SatelliteObservationSummaryResponse): string {
  switch (result.trend.direction) {
    case "decreasing":
      return "Wskaźnik NDMI obniżył się w analizowanym okresie.";
    case "increasing":
      return "Wskaźnik NDMI wzrósł w analizowanym okresie.";
    case "no-clear-change":
      return "Wskaźnik NDMI nie wykazuje wyraźnego kierunku zmian.";
    case "insufficient":
      return "Dostępne obserwacje nie pozwalają jeszcze wiarygodnie określić kierunku zmian wskaźnika NDMI.";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "SATELLITE_PROVIDER_NOT_CONFIGURED") {
      return "Dostęp do statystyk CDSE nie jest skonfigurowany.";
    }
    if (error.code === "SATELLITE_PROVIDER_AUTHENTICATION_FAILED") {
      return "Usługa CDSE odrzuciła konfigurację dostępu.";
    }
    if (error.code === "NETWORK_ERROR") return "Brak połączenia z usługą danych.";
  }
  return "Nie udało się pobrać obserwacji satelitarnych.";
}

function ObservationStatus({ status }: { status: SatelliteObservationSummaryResponse["status"] }) {
  const presentation = (
    {
      available: { variant: "success", label: "Dane dostępne" },
      limited: { variant: "warning", label: "Dane ograniczone" },
      unavailable: { variant: "neutral", label: "Brak wystarczających danych" },
    } as const
  )[status];

  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

function SatelliteDataSourceDetails({ result }: { result: SatelliteObservationSummaryResponse }) {
  const observation = result.selectedObservation;
  const validPixelPercent = observation ? getValidPixelPercent(observation) : null;
  const threshold = observation ? getQualityThreshold(observation) : null;

  return (
    <div className="source-details">
      <dl className="source-facts">
        <div>
          <dt className="text-muted-foreground">Źródło i rodzaj danych</dt>
          <dd className="mt-0.5 font-medium">Copernicus Sentinel-2 L2A · mediana NDMI</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data obserwacji</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {observation ? formatObservationDate(observation.date) : "Brak"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pobrano</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {formatRetrievedAt(result.provenance.retrievedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pokrycie użytecznymi danymi</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {validPixelPercent === null
              ? "Brak danych"
              : `${percentFormatter.format(validPixelPercent)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Próg jakości aplikacji</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {threshold === null ? "Brak danych" : `${percentFormatter.format(threshold)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rozdzielczość NDMI</dt>
          <dd className="mt-0.5 font-medium">20 m · jeden piksel obejmuje około 20 × 20 m</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dostawca i atrybucja</dt>
          <dd className="mt-0.5 break-words font-medium">
            {result.provenance.provider} · {result.provenance.license}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Okres wyszukiwania</dt>
          <dd className="mt-0.5 font-medium">
            Do {result.searchPeriod.maxLookbackDays} dni przed datą analizy
          </dd>
        </div>
      </dl>
      {result.limitations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Ograniczenia pobrania</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            {result.limitations.map((limitation) => (
              <li key={limitation}>{limitationLabel(limitation)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        Próg jakości jest wewnętrzną zasadą aplikacji, a nie normą Copernicus. Klasy SCL służą do
        odrzucania między innymi chmur, cieni chmur, śniegu i pikseli bez danych. Wskaźnik NDMI
        opisuje odbicie spektralne roślinności i nie potwierdza samodzielnie suszy.
      </p>
    </div>
  );
}

function AvailableResult({ result }: { result: SatelliteObservationSummaryResponse }) {
  const observation = result.selectedObservation;
  if (!observation) return null;
  const ageDays = differenceInCalendarDays(result.analysisDate, observation.date);
  const validPixelPercent = getValidPixelPercent(observation);

  return (
    <>
      <div className="mt-5">
        <h3 className="font-semibold">Ostatnia użyteczna obserwacja</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            <span className="tabular-nums">{formatObservationDate(observation.date)}</span>
          </p>
          {validPixelPercent !== null && (
            <p>
              Użyteczne dane dla {percentFormatter.format(validPixelPercent)}% analizowanej
              powierzchni działki
            </p>
          )}
        </div>
      </div>
      {ageDays > STALE_OBSERVATION_DAYS && (
        <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-amber-900" role="status">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Ostatnia użyteczna obserwacja jest o {ageDays} dni wcześniejsza od daty analizy. Nie
          opisuje stanu działki na wybrany dzień.
        </p>
      )}
    </>
  );
}

function LimitedResult() {
  return (
    <>
      <h3 className="mt-5 font-semibold">Dane satelitarne ograniczone</h3>
      <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-950">
        <p className="text-sm leading-6">
          Dostępne obserwacje nie obejmują wystarczającej części działki, aby uzyskać wiarygodną
          ocenę roślinności.
        </p>
      </div>
    </>
  );
}

function UnavailableResult({ result }: { result: SatelliteObservationSummaryResponse }) {
  return (
    <>
      <h3 className="mt-5 font-semibold">Brak wystarczających danych satelitarnych</h3>
      <div className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-stone-800">
        <p className="text-sm leading-6">
          {result.reason === "statistics-unavailable"
            ? "Znamy daty zdjęć, ale nie udało się obliczyć wskaźników dla działki."
            : "Nie znaleziono obserwacji o wystarczającej jakości w analizowanym okresie."}{" "}
          Dane satelitarne nie zostały wykorzystane do oceny sytuacji wodnej.
        </p>
      </div>
    </>
  );
}

function CropContext({
  cropLabel,
  assessment,
}: {
  cropLabel: string;
  assessment: WaterAssessmentResponse | undefined;
}) {
  const outsideSeason =
    assessment?.phenology.status === "outside-active-season" ||
    assessment?.evaluation?.scope === "completed-season";
  return (
    <div className="mt-5 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Co te obserwacje oznaczają dla uprawy?</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {outsideSeason
          ? `Wybrana data wypada poza modelowanym sezonem uprawy „${cropLabel}”. Zdjęcia opisują powierzchnię działki. Nie potwierdzamy, że pokazana roślinność to ta uprawa.`
          : `Dla uprawy „${cropLabel}” zmiany wskaźnika trzeba odczytywać razem z fazą rozwoju i pogodą. ${assessment?.phenology.activeScenarioCount ? "Model korzysta z założeń o rozwoju uprawy, a nie z potwierdzonej obserwacji jej fazy na polu." : "Nie znamy potwierdzonej fazy rozwoju tej uprawy na wybrany dzień."}`}{" "}
        Same obserwacje nie potwierdzają niedoboru wody ani pogorszenia kondycji uprawy.
      </p>
    </div>
  );
}

function WaterBalanceComparison({
  assessment,
}: {
  assessment: WaterAssessmentResponse | undefined;
}) {
  if (!assessment) return null;
  const satellite = assessment.satellite;
  const completedSeasonEnd =
    assessment.completedSeason?.evaluation?.evaluatedThroughDate ??
    (assessment.evaluation?.scope === "completed-season"
      ? assessment.evaluation.evaluatedThroughDate
      : null);
  const qualificationMessages: Record<
    WaterAssessmentResponse["satellite"]["interpretationReason"],
    string
  > = {
    "not-requested": completedSeasonEnd
      ? `Bilans uprawy obejmuje zakończony okres do ${formatObservationDate(completedSeasonEnd)}. Obserwacji z okresu wokół wybranej daty nie porównujemy z bilansem tego sezonu.`
      : "Dla tej analizy nie wykonano porównania obserwacji z bilansem wodnym.",
    "provider-unavailable": "Nie udało się uzyskać obserwacji do porównania z bilansem wodnym.",
    "observation-too-old":
      "Ostatnia użyteczna obserwacja jest starsza niż 14 dni względem daty analizy.",
    "outside-comparable-growth-stage":
      "Nie wszystkie zdjęcia pochodzą ze środkowej fazy rozwoju uprawy według modelu. Na zmiany wskaźnika może wpływać naturalny rozwój roślin, dlatego nie porównujemy ich z bilansem wodnym.",
    "phenology-unavailable":
      "Brakuje danych pozwalających określić modelowany okres rozwoju uprawy.",
    "limited-observation-quality": "Zbyt mała część działki ma dane odpowiedniej jakości.",
    "insufficient-trend":
      "Do oceny kierunku zmian potrzeba co najmniej czterech użytecznych obserwacji.",
    "no-clear-trend": "Obserwacje nie pokazują wyraźnego kierunku zmian.",
    "decreasing-mid-season-ndmi":
      "Spadek wskaźnika wymaga wspólnej oceny z fazą rozwoju uprawy i bilansem wodnym.",
    "increasing-mid-season-ndmi":
      "Wzrost wskaźnika wymaga wspólnej oceny z fazą rozwoju uprawy i bilansem wodnym.",
  };
  const presentation = {
    "consistent-with-balance": {
      className: "bg-emerald-50 text-emerald-950",
      title: "Obserwacja jest zgodna z bilansem wodnym",
      description:
        "Zmiany wskaźnika uwodnienia roślinności są zgodne z wynikiem modelu dostępności wody. To dodatkowa wskazówka, która nie zmienia oceny modelu.",
    },
    "conflicts-with-balance": {
      className: "bg-amber-50 text-amber-950",
      title: "Obserwacja nie jest zgodna z bilansem wodnym",
      description:
        "Sygnał satelitarny i model prowadzą do różnych wniosków. Wynik wymaga sprawdzenia fazy uprawy i warunków w terenie.",
    },
    neutral: {
      className: "bg-secondary text-secondary-foreground",
      title: "Brak wyraźnego kierunku zmian",
      description:
        "Obserwacje nie pokazują wyraźnego kierunku zmian, dlatego nie wzmacniają ani nie podważają wyniku modelu dostępności wody.",
    },
    "not-comparable": {
      className: "bg-secondary text-secondary-foreground",
      title: "Model nie daje jednoznacznej oceny dostępności wody",
      description:
        "Obserwacje mają wystarczającą jakość, ale model nie daje jednoznacznego wyniku, z którym można je porównać.",
    },
    "not-qualified": {
      className: "bg-secondary text-secondary-foreground",
      title: completedSeasonEnd
        ? "Obserwacje poza modelowanym sezonem uprawy"
        : "Brak porównania z bilansem wodnym",
      description: qualificationMessages[satellite.interpretationReason],
    },
    unavailable: {
      className: "bg-secondary text-secondary-foreground",
      title: "Satelita nie uczestniczy w porównaniu",
      description: "Nie udało się uzyskać użytecznej obserwacji dla daty analizy.",
    },
  }[satellite.consistency];

  return (
    <div className={`mt-5 rounded-xl px-4 py-3 ${presentation.className}`}>
      <h3 className="text-sm font-semibold">{presentation.title}</h3>
      <p className="mt-1 text-sm leading-6">{presentation.description}</p>
    </div>
  );
}

export function SatelliteObservationsCard({
  crop,
  cropLabel,
  parcel,
  throughDate,
  seasonStartDate,
}: SatelliteObservationsCardProps) {
  const query = useQuery({
    queryKey: ["satellite-observation-summary", parcel.identifier, parcel.geometry, throughDate],
    queryFn: ({ signal }) =>
      getSatelliteObservationSummary(
        { analysisDate: throughDate, geometry: parcel.geometry },
        signal,
      ),
    retry: false,
    staleTime: 10 * 60 * 1_000,
  });
  const assessmentRequest = crop
    ? createWaterAssessmentRequest({
        analysisDate: throughDate,
        crop,
        parcelIdentifier: parcel.identifier,
        seasonStartDate,
      })
    : null;
  const assessmentQuery = useQuery({
    queryKey: ["water-assessment", parcel.identifier, crop, throughDate, seasonStartDate],
    queryFn: ({ signal }) =>
      getWaterAssessment(assessmentRequest as NonNullable<typeof assessmentRequest>, signal),
    enabled: assessmentRequest !== null,
    retry: false,
    staleTime: 30 * 60 * 1_000,
  });

  return (
    <section
      aria-labelledby="satellite-observations-title"
      className="satellite-observations-card rounded-2xl bg-background"
    >
      <ReportSectionHeader
        description="Zdjęcia pomagają śledzić zmiany uwodnienia roślinności na działce."
        icon={Satellite}
        id="satellite-observations-title"
        source={
          query.data
            ? {
                content: <SatelliteDataSourceDetails result={query.data} />,
                description:
                  "Pochodzenie, aktualność i ograniczenia obserwacji Sentinel-2 wykorzystanych w tej sekcji.",
                title: "Źródło danych satelitarnych",
              }
            : undefined
        }
        status={query.data ? <ObservationStatus status={query.data.status} /> : undefined}
        title="Obserwacje satelitarne"
      />

      {query.isPending ? (
        <div aria-label="Pobieranie obserwacji satelitarnych" className="mt-5" role="status">
          <div className="h-4 w-44 animate-pulse rounded bg-secondary" />
          <div className="mt-3 h-16 animate-pulse rounded-xl bg-secondary/70" />
        </div>
      ) : query.isError ? (
        <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-red-950" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <h3 className="font-semibold">Nie udało się pobrać danych satelitarnych</h3>
              <p className="mt-1 text-sm leading-5">{getErrorMessage(query.error)}</p>
              <RetryButton
                className="mt-3"
                isRetrying={query.isFetching}
                onRetry={() => void query.refetch()}
              >
                Spróbuj ponownie
              </RetryButton>
            </div>
          </div>
        </div>
      ) : (
        <>
          {!assessmentQuery.isError && <WaterBalanceComparison assessment={assessmentQuery.data} />}
          {query.data.status === "available" && <AvailableResult result={query.data} />}
          {query.data.status === "limited" && <LimitedResult />}
          {query.data.status === "unavailable" && <UnavailableResult result={query.data} />}
          {crop && assessmentQuery.isPending && (
            <Spinner
              className="mt-5 text-muted-foreground"
              label="Sprawdzamy, czy obserwacje można porównać z bilansem wodnym uprawy."
            />
          )}
          {crop && assessmentQuery.isError && (
            <div className="mt-5 rounded-xl bg-secondary px-4 py-3 text-sm" role="status">
              <p>Nie udało się porównać obserwacji z bilansem wodnym. Wykres pozostaje dostępny.</p>
              <RetryButton
                className="mt-3"
                isRetrying={assessmentQuery.isFetching}
                onRetry={() => void assessmentQuery.refetch()}
              >
                Ponów porównanie
              </RetryButton>
            </div>
          )}
          {query.data.status === "available" && (
            <p className="mt-5 text-sm font-semibold leading-6">{getTrendSummary(query.data)}</p>
          )}
          <VegetationHistoryChart
            fromDate={query.data.searchPeriod.from}
            history={query.data.history}
            toDate={query.data.searchPeriod.to}
          />
          <CropContext
            assessment={assessmentQuery.isError ? undefined : assessmentQuery.data}
            cropLabel={cropLabel}
          />
          <section
            aria-label="Źródło i jakość danych satelitarnych"
            className="mt-5 hidden border-t border-border pt-4 print:block"
          >
            <h3 className="mb-3 text-sm font-semibold">Źródło i jakość danych</h3>
            <SatelliteDataSourceDetails result={query.data} />
          </section>
        </>
      )}
    </section>
  );
}
