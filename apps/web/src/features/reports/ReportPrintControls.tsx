import "./report-print.css";
import { CROP_CATALOG, type ParcelResponse, WeatherPeriodPresetSchema } from "@kowr/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Chart as ChartJS } from "chart.js";
import { FileText, Printer } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { SatelliteObservationsCard } from "../satellite-history/SatelliteObservationsCard";
import { TerrainContextSection } from "../terrain-context/TerrainContextSection";
import { WeatherConditionsSection } from "../weather-conditions/WeatherConditionsSection";
import { DataSourceDrawerProvider } from "./DataSourceDrawer";
import { HistoricalSusceptibilitySection } from "./HistoricalSusceptibilitySection";
import { PrintSourceSummary } from "./PrintSourceSummary";
import {
  arePrintQueriesReady,
  getPrintQueryKeys,
  type PrintReportSelection,
} from "./print-report-data";
import { RecommendationsSection } from "./RecommendationsSection";
import { ReportPrintContext, type ReportPrintVariant } from "./report-print-context";
import { SoilProfileSection } from "./SoilProfileCard";
import { WaterSituationSummary } from "./WaterSituationSummary";

type Props = {
  parcel: ParcelResponse | null;
  selection: Omit<PrintReportSelection, "weatherPreset"> | null;
};

export function ReportPrintControls({ parcel, selection }: Props) {
  const [variant, setVariant] = useState<ReportPrintVariant | null>(null);
  const [printError, setPrintError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [params] = useSearchParams();
  const preset = WeatherPeriodPresetSchema.safeParse(params.get("weatherPeriod"));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contextKey = `${parcel?.identifier}:${selection?.crop}:${JSON.stringify(selection?.dateSelection)}`;
  const requestedContextRef = useRef(contextKey);
  const close = useCallback((failed = false) => {
    setPrintError(failed);
    setVariant(null);
    setMenuOpen(failed);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (variant && requestedContextRef.current !== contextKey) close();
  }, [variant, contextKey, close]);

  function open(next: ReportPrintVariant) {
    if (!parcel || !selection) return;
    setPrintError(false);
    setMenuOpen(false);
    requestedContextRef.current = contextKey;
    setVariant(next);
  }

  return (
    <div className="report-print-controls flex items-center">
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button
            ref={triggerRef}
            aria-label="Drukuj raport"
            title={
              parcel && selection
                ? "Drukuj raport"
                : "Wybierz działkę, uprawę i termin analizy, aby wydrukować raport"
            }
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            disabled={!parcel || !selection}
            aria-busy={variant !== null}
          >
            {variant ? (
              <Spinner label="Przygotowujemy raport i otwieramy okno drukowania…" />
            ) : (
              <Printer aria-hidden="true" className="size-5" />
            )}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            <DropdownMenu.Label className="px-3 py-2 text-sm font-semibold">
              Wydrukuj lub zapisz PDF
            </DropdownMenu.Label>
            <DropdownMenu.Item
              aria-label="Raport prosty"
              disabled={variant !== null}
              onSelect={() => open("simple")}
              className="flex min-h-14 cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm outline-none data-disabled:opacity-50 data-highlighted:bg-secondary"
            >
              <Printer aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block font-medium">Raport prosty</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Ocena, zalecenia i podstawowe wykresy
                </span>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              aria-label="Raport rozszerzony"
              disabled={variant !== null}
              onSelect={() => open("extended")}
              className="flex min-h-14 cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm outline-none data-disabled:opacity-50 data-highlighted:bg-secondary"
            >
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block font-medium">Raport rozszerzony</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Pełne dane, scenariusze i wyjaśnienia
                </span>
              </span>
            </DropdownMenu.Item>
            {variant && (
              <>
                <DropdownMenu.Separator className="my-1 border-t border-border" />
                <p className="px-3 py-2 text-xs leading-5 text-muted-foreground" role="status">
                  Przygotowujemy raport i podkłady mapowe…
                </p>
                <DropdownMenu.Item
                  onSelect={() => close()}
                  className="min-h-11 cursor-default rounded-md px-3 py-2.5 text-sm outline-none data-highlighted:bg-secondary"
                >
                  Anuluj przygotowanie
                </DropdownMenu.Item>
              </>
            )}
            {printError && (
              <p className="px-3 py-2 text-sm text-destructive" role="alert">
                Nie udało się uruchomić drukowania. Spróbuj ponownie.
              </p>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {variant &&
        parcel &&
        selection &&
        createPortal(
          <ReportPrintJob
            key={`${parcel.identifier}:${selection.crop}:${JSON.stringify(selection.dateSelection)}:${variant}`}
            parcel={parcel}
            selection={{ ...selection, weatherPreset: preset.success ? preset.data : "30-days" }}
            variant={variant}
            onFinish={close}
          />,
          document.body,
        )}
    </div>
  );
}

function ReportPrintJob({
  parcel,
  selection,
  variant,
  onFinish,
}: {
  parcel: ParcelResponse;
  selection: PrintReportSelection;
  variant: ReportPrintVariant;
  onFinish: (failed?: boolean) => void;
}) {
  const client = useQueryClient();
  const documentRef = useRef<HTMLElement>(null);
  const activeRef = useRef(true);
  const startedRef = useRef(false);
  const originalTitleRef = useRef(document.title);
  const [sourceContainer, setSourceContainer] = useState<HTMLDivElement | null>(null);
  const [generatedAt] = useState(() => new Date().toISOString());
  const getKeys = useCallback(
    () => getPrintQueryKeys(client, selection, variant, parcel.geometry),
    [client, selection, variant, parcel.geometry],
  );
  const subscribe = useCallback(
    (listener: () => void) => client.getQueryCache().subscribe(listener),
    [client],
  );
  const snapshot = useCallback(() => arePrintQueriesReady(client, getKeys()), [client, getKeys]);
  const ready = useSyncExternalStore(subscribe, snapshot);
  const analysisDate =
    selection.dateSelection.type === "day"
      ? selection.dateSelection.date
      : selection.dateSelection.endDate;
  const cropLabel = CROP_CATALOG.find(({ id }) => id === selection.crop)?.label ?? selection.crop;

  useEffect(() => {
    activeRef.current = true;
    document.body.classList.add("has-print-report");
    const finish = () => onFinish();
    window.addEventListener("afterprint", finish);
    return () => {
      activeRef.current = false;
      if (startedRef.current) document.title = originalTitleRef.current;
      document.body.classList.remove("has-print-report");
      window.removeEventListener("afterprint", finish);
    };
  }, [onFinish]);

  useLayoutEffect(() => {
    if (!ready || (variant === "extended" && !sourceContainer)) return;
    // Expand native disclosures only in the independent print document.
    for (const details of documentRef.current?.querySelectorAll("details") ?? []) {
      if (
        !details.closest(".print-extended-only") &&
        (variant === "extended" || details.classList.contains("print-history-comparison"))
      ) {
        details.open = true;
      }
    }
  }, [ready, variant, sourceContainer]);

  useEffect(() => {
    if (!ready || startedRef.current || (variant === "extended" && !sourceContainer)) return;
    let cancelled = false;
    async function printReport() {
      try {
        await document.fonts?.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (cancelled || !activeRef.current || !snapshot() || startedRef.current) return;
        for (const canvas of documentRef.current?.querySelectorAll("canvas") ?? []) {
          const chart = ChartJS.getChart(canvas);
          chart?.resize();
          chart?.update("none");
        }
        startedRef.current = true;
        document.title = `HydroPlon-${parcel.identifier.replaceAll("/", "-")}-${analysisDate}-${variant === "simple" ? "prosty" : "rozszerzony"}`;
        window.print();
      } catch {
        if (!cancelled && activeRef.current) onFinish(true);
      }
    }
    void printReport();
    return () => {
      cancelled = true;
    };
  }, [ready, variant, sourceContainer, snapshot, parcel.identifier, analysisDate, onFinish]);

  const common = { analysisDate, crop: selection.crop, parcelIdentifier: parcel.identifier };
  return (
    <div className="report-print-staging" aria-hidden="true" inert>
      <ReportPrintContext.Provider value={{ variant, sourceContainer }}>
        <DataSourceDrawerProvider>
          <article
            className="print-document"
            data-variant={variant}
            ref={documentRef}
            aria-label="Raport działki do wydruku"
          >
            <header className="print-report-heading">
              <h1>HydroPlon</h1>
              <p>
                {variant === "simple" ? "Raport prosty" : "Raport rozszerzony"} ·{" "}
                {parcel.identifier}
              </p>
              <dl>
                <div>
                  <dt>Działka</dt>
                  <dd>
                    {parcel.parcelNumber} ·{" "}
                    {Object.values(parcel.administrativeArea).filter(Boolean).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Uprawa</dt>
                  <dd>{cropLabel}</dd>
                </div>
                <div>
                  <dt>Wybrany dzień lub okres</dt>
                  <dd>
                    {selection.dateSelection.type === "range"
                      ? `${selection.dateSelection.startDate} – `
                      : ""}
                    {analysisDate}
                  </dd>
                </div>
                <div>
                  <dt>Raport sporządzono</dt>
                  <dd>{generatedAt} (UTC)</dd>
                </div>
              </dl>
              {selection.dateSelection.type === "range" && (
                <p>
                  Bilans wodny uprawy obejmuje okres do wybranej daty końcowej, a wykres pogody
                  przedstawia wybrany zakres dat.
                </p>
              )}
            </header>
            <div className="print-overview">
              <WaterSituationSummary {...common} />
            </div>
            <div className="print-chapter print-actions">
              <RecommendationsSection {...common} parcel={parcel} />
            </div>
            <div className="print-chapter print-history">
              <HistoricalSusceptibilitySection {...common} />
            </div>
            <div className="print-chapter print-weather">
              <WeatherConditionsSection
                crop={selection.crop}
                dateSelection={selection.dateSelection}
                parcel={parcel}
              />
            </div>
            <div className="print-chapter">
              <TerrainContextSection parcel={parcel} />
            </div>
            {variant === "extended" && (
              <>
                <div className="print-chapter">
                  <SatelliteObservationsCard
                    crop={selection.crop}
                    cropLabel={cropLabel}
                    parcel={parcel}
                    throughDate={analysisDate}
                  />
                </div>
                <div className="print-chapter">
                  <SoilProfileSection parcelIdentifier={parcel.identifier} />
                </div>
              </>
            )}
            {ready && <PrintSourceSummary parcel={parcel} selection={selection} />}
            {variant === "extended" && (
              <section className="print-chapter print-source-appendix">
                <h2>Metodyka, szczegóły źródeł i tabele danych</h2>
                <div ref={setSourceContainer} />
              </section>
            )}
          </article>
        </DataSourceDrawerProvider>
      </ReportPrintContext.Provider>
    </div>
  );
}
