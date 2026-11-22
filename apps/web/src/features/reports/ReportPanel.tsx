import { CROP_CATALOG, CROP_GROUPS, CropSchema, type ParcelResponse } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarDays, Database, LandPlot, Pencil, Sprout } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { getCropDetection } from "../../api/crop-detections";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getAnalysisDateBounds, isCalendarDate, parseLocalDate } from "../analysis/analysis-date";
import { getValidAnalysisSelection } from "../analysis/analysis-search-params";
import { getCropGroupIcon } from "../analysis/crop-icons";
import { SatelliteObservationsCard } from "../satellite-history/SatelliteObservationsCard";
import { TerrainContextSection } from "../terrain-context/TerrainContextSection";
import { WeatherConditionsSection } from "../weather-conditions/WeatherConditionsSection";
import { DataSourceDrawerProvider } from "./DataSourceDrawer";
import { HistoricalSusceptibilitySection } from "./HistoricalSusceptibilitySection";
import { RecommendationsSection } from "./RecommendationsSection";
import { ReportEvidenceDetails } from "./ReportEvidenceDetails";
import { SoilProfileSection } from "./SoilProfileCard";
import { WaterSituationSummary } from "./WaterSituationSummary";

function formatDate(value: string): string {
  return isCalendarDate(value)
    ? format(parseLocalDate(value), "d MMMM yyyy", { locale: pl })
    : "Nieprawidłowa data";
}

function getCrop(value: string | null) {
  const crop = CropSchema.safeParse(value);
  if (!crop.success) return undefined;

  return CROP_CATALOG.find(({ id }) => id === crop.data);
}

function getCropGroupLabel(group: (typeof CROP_GROUPS)[number]["id"]): string {
  return CROP_GROUPS.find(({ id }) => id === group)?.label ?? "Inna grupa";
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value);
}

function getPeriodLabel(searchParams: URLSearchParams): string {
  if (searchParams.get("dateMode") === "range") {
    const startDate = searchParams.get("dateFrom");
    const endDate = searchParams.get("dateTo");

    if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  const day = searchParams.get("analysisDate");
  return day ? formatDate(day) : "Nie wybrano";
}

function getLocationLabel(parcel: ParcelResponse): string {
  const parts = [
    parcel.administrativeArea.cadastralDistrict,
    parcel.administrativeArea.commune,
    parcel.administrativeArea.county,
    parcel.administrativeArea.voivodeship,
  ].filter((value): value is string => value !== null);

  return [...new Set(parts)].join(", ") || "Brak danych";
}

function getSourceLabel(parcel: ParcelResponse): string {
  return parcel.provenance.datasource
    ? `${parcel.provenance.provider} · ${parcel.provenance.datasource}`
    : parcel.provenance.provider;
}

function formatRetrievedAt(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type ReportPanelProps = {
  onBack: () => void;
  parcel: ParcelResponse;
};

export function ReportPanel({ onBack, parcel }: ReportPanelProps) {
  const [searchParams] = useSearchParams();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const selectedCrop = getCrop(searchParams.get("crop"));
  const SelectedCropIcon = selectedCrop ? getCropGroupIcon(selectedCrop.group) : Sprout;
  const cropDetectionQuery = useQuery({
    queryKey: ["crop-detection", parcel.identifier],
    queryFn: ({ signal }) => getCropDetection(parcel, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const selectedCropDeclaration = selectedCrop
    ? cropDetectionQuery.data?.candidates.find(({ crop }) => crop === selectedCrop.id)
    : undefined;
  const selectedCropPercent = selectedCropDeclaration
    ? formatPercent(selectedCropDeclaration.overlapPercent)
    : null;
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <h2
          className="min-w-0 break-words text-xl font-semibold tracking-tight outline-none"
          id="report-panel-title"
          ref={titleRef}
          tabIndex={-1}
        >
          Działka {parcel.parcelNumber}
        </h2>
        <Button
          aria-label="Edytuj dane"
          className="size-10 text-primary"
          onClick={onBack}
          size="icon"
          title="Edytuj dane"
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{getLocationLabel(parcel)}</p>
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Uprawa do analizy</dt>
          <dd className="mt-1 flex items-center gap-2 font-semibold">
            <SelectedCropIcon aria-hidden="true" className="size-4 text-primary" />
            {selectedCrop?.label ?? "Nie wybrano"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Dzień lub okres</dt>
          <dd className="mt-1 flex items-center gap-2 font-medium">
            <CalendarDays aria-hidden="true" className="size-4 text-primary" />
            {getPeriodLabel(searchParams)}
          </dd>
        </div>
      </dl>
      <details className="mt-5 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        <summary className="min-h-8 cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Szczegóły działki i założenia
        </summary>
        <dl className="mt-2 space-y-3">
          <div>
            <dt className="font-medium text-foreground">Identyfikator działki</dt>
            <dd className="break-all">{parcel.identifier}</dd>
          </div>
          {selectedCrop && (
            <div>
              <dt className="font-medium text-foreground">Grupa upraw</dt>
              <dd>{getCropGroupLabel(selectedCrop.group)}</dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-foreground">Deklaracja uprawy · ARiMR GSA 2025</dt>
            <dd>
              {cropDetectionQuery.isPending ? (
                <Spinner label="Sprawdzamy deklarację uprawy…" />
              ) : cropDetectionQuery.isError ? (
                <span role="status">
                  Nie udało się pobrać udziału powierzchni z ARiMR GSA 2025.
                </span>
              ) : selectedCrop && selectedCropDeclaration && selectedCropPercent ? (
                <>
                  <span>{selectedCropPercent}%</span> powierzchni działki
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      aria-label={`${selectedCrop.label}: ${selectedCropPercent}% powierzchni działki`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={selectedCropDeclaration.overlapPercent}
                      aria-valuetext={`${selectedCropPercent}% powierzchni działki`}
                      className="h-full rounded-full bg-primary"
                      role="progressbar"
                      style={{ width: `${selectedCropDeclaration.overlapPercent}%` }}
                    />
                  </div>
                  {!cropDetectionQuery.data.complete && (
                    <p className="mt-1">
                      Dane źródłowe są niepełne; udział może nie obejmować całej działki.
                    </p>
                  )}
                  <p className="mt-1">Deklaracja nie potwierdza faktycznie rosnącej rośliny.</p>
                </>
              ) : (
                <span role="status">
                  {cropDetectionQuery.data.complete
                    ? "Brak tej uprawy w deklaracji ARiMR GSA 2025."
                    : "Niepełne dane ARiMR GSA 2025 nie potwierdzają udziału tej uprawy."}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Początek sezonu</dt>
            <dd>Orientacyjny termin dla uprawy przyjęty automatycznie</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Źródło granicy</dt>
            <dd>{getSourceLabel(parcel)}</dd>
            <dd>Pobrano {formatRetrievedAt(parcel.provenance.retrievedAt)}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

type ReportResultsSectionProps = {
  parcel: ParcelResponse;
};

export function ReportResultsSection({ parcel }: ReportResultsSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const validSelection = getValidAnalysisSelection(searchParams, getAnalysisDateBounds(new Date()));
  const selectedCrop = getCrop(searchParams.get("crop"));
  const throughDate =
    searchParams.get("dateMode") === "range"
      ? searchParams.get("dateTo")
      : searchParams.get("analysisDate");
  const dateFrom = searchParams.get("dateFrom");
  const dateMode = searchParams.get("dateMode");
  const dateSelection =
    dateMode === "range" && dateFrom && throughDate
      ? ({ type: "range", startDate: dateFrom, endDate: throughDate } as const)
      : throughDate
        ? ({ type: "day", date: throughDate } as const)
        : null;

  return (
    <DataSourceDrawerProvider>
      <section aria-label="Wyniki raportu działki" className="workspace-report-body">
        {selectedCrop && throughDate && validSelection && (
          <>
            <WaterSituationSummary
              analysisDate={throughDate}
              crop={selectedCrop.id}
              onAnalysisDateChange={(date) => {
                const next = new URLSearchParams(searchParams);
                if (next.get("dateMode") === "range") next.set("dateTo", date);
                else next.set("analysisDate", date);
                setSearchParams(next);
              }}
              parcelIdentifier={parcel.identifier}
            />
            <RecommendationsSection
              parcel={parcel}
              analysisDate={throughDate}
              crop={selectedCrop.id}
              parcelIdentifier={parcel.identifier}
            />
            <HistoricalSusceptibilitySection
              analysisDate={throughDate}
              crop={selectedCrop.id}
              parcelIdentifier={parcel.identifier}
            />
          </>
        )}

        <section aria-labelledby="report-evidence-title" className="report-evidence">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight" id="report-evidence-title">
              Poznaj dane swojej działki
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Otwórz wybrany temat, aby zobaczyć dane, wykresy i źródła. Dodatkowe zestawienia
              wczytamy po otwarciu.
            </p>
          </div>
          <ReportEvidenceDetails
            title="Teren i woda w okolicy"
            description="Ukształtowanie działki, rowy, cieki i otoczenie"
            icon={LandPlot}
          >
            <TerrainContextSection parcel={parcel} />
          </ReportEvidenceDetails>
          {selectedCrop && dateSelection && validSelection && (
            <ReportEvidenceDetails
              title="Opady i pogoda"
              description="Ile padało i jak ten okres wypada na tle innych lat"
              icon={CalendarDays}
            >
              <WeatherConditionsSection
                crop={selectedCrop.id}
                dateSelection={dateSelection}
                parcel={parcel}
              />
            </ReportEvidenceDetails>
          )}
          {throughDate && selectedCrop && validSelection && (
            <ReportEvidenceDetails
              title="Roślinność z satelity"
              description="Obserwacje kondycji roślin i ich aktualność"
              icon={Sprout}
            >
              <SatelliteObservationsCard
                crop={selectedCrop.id}
                cropLabel={selectedCrop.label}
                parcel={parcel}
                throughDate={throughDate}
              />
            </ReportEvidenceDetails>
          )}
          <ReportEvidenceDetails
            title="Gleba i zatrzymywanie wody"
            description="Model właściwości gleby, a nie bieżący pomiar wilgotności"
            icon={Database}
          >
            <SoilProfileSection parcelIdentifier={parcel.identifier} />
          </ReportEvidenceDetails>
        </section>
        <p className="report-footnote text-xs leading-5 text-muted-foreground">
          Ocena pomaga w planowaniu prac. Rzeczywiste warunki na polu mogą różnić się od modelu.
          Źródła i ograniczenia znajdziesz przy poszczególnych wynikach.
        </p>
      </section>
    </DataSourceDrawerProvider>
  );
}
