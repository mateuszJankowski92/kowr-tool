import type {
  HydrologyKind,
  LandUseKind,
  ParcelResponse,
  TerrainContextResponse,
  TerrainTextureResponse,
} from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Droplets,
  LandPlot,
  Rotate3D,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { getTerrainContext } from "../../api/terrain-context";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { PrintParcelMap } from "../reports/PrintParcelMap";
import { ReportSectionHeader } from "../reports/ReportSectionHeader";
import { useReportPrint } from "../reports/report-print-context";

const HydrologyMap = lazy(() =>
  import("./HydrologyMap").then((module) => ({ default: module.HydrologyMap })),
);

const TerrainModel = lazy(() =>
  import("./TerrainModel").then((module) => ({ default: module.TerrainModel })),
);

type TerrainAvailable = Extract<TerrainContextResponse["terrain"], { status: "available" }>;
type HydrologyAvailable = Extract<
  TerrainContextResponse["surroundings"]["hydrology"],
  { status: "available" }
>;
type LandUseAvailable = Extract<
  TerrainContextResponse["surroundings"]["landUse"],
  { status: "available" }
>;

const numberFormatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

const HYDROLOGY_LABELS: Record<HydrologyKind, string> = {
  river: "Rzeka",
  stream: "Strumień lub mały ciek",
  canal: "Kanał",
  ditch: "Rów",
  drain: "Rów odwadniający",
  lake: "Jezioro",
  pond: "Staw",
  reservoir: "Zbiornik",
  wetland: "Teren podmokły",
  "other-water": "Obiekt wodny",
};

const LAND_USE_LABELS: Record<LandUseKind, string> = {
  agriculture: "Grunty rolne",
  forest: "Lasy i zadrzewienia",
  grassland: "Łąki i roślinność",
  wetland: "Tereny podmokłe",
  water: "Wody powierzchniowe",
  "built-up": "Teren zabudowany",
  other: "Pozostałe pokrycie",
};

function formatMeters(value: number): string {
  return `${numberFormatter.format(value)} m`;
}

function formatDistance(value: number): string {
  if (value < 1_000) return `${Math.round(value)} m`;
  return `${numberFormatter.format(value / 1_000)} km`;
}

function formatDegrees(value: number | null): string {
  return value === null ? "brak danych" : `${numberFormatter.format(value)}°`;
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

function formatAspect(
  value: TerrainAvailable["metrics"]["dominantAspect"],
  slopeSampleCount: number,
) {
  const labels = {
    N: "północ",
    NE: "północny wschód",
    E: "wschód",
    SE: "południowy wschód",
    S: "południe",
    SW: "południowy zachód",
    W: "zachód",
    NW: "północny zachód",
  } as const;
  if (slopeSampleCount === 0) return "brak danych";
  return value === null ? "brak dominującego kierunku" : labels[value];
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function useNearViewport() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (!element || isNear || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "280px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, isNear]);

  return { ref: setElement, isNear, activate: () => setIsNear(true) };
}

function TerrainLoading() {
  return (
    <section aria-busy="true" aria-labelledby="terrain-context-title" className="terrain-section">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <ReportSectionHeader
          description="Sprawdzamy rzeźbę terenu, pobliskie obiekty wodne i sposób użytkowania powierzchni."
          icon={LandPlot}
          id="terrain-context-title"
          title="Teren, woda i użytkowanie działki"
        />
      </div>
      <div
        className="terrain-loading"
        role="status"
        aria-label="Łączymy dane GUGiK i OpenStreetMap…"
      >
        <div className="h-56 w-full animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      </div>
    </section>
  );
}

function TerrainError({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <section aria-labelledby="terrain-context-title" className="terrain-section">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <ReportSectionHeader
          description="Sprawdzamy rzeźbę terenu, pobliskie obiekty wodne i sposób użytkowania powierzchni."
          icon={LandPlot}
          id="terrain-context-title"
          title="Teren, woda i użytkowanie działki"
        />
      </div>
      <div className="terrain-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>Nie udało się pobrać kontekstu przestrzennego.</strong>
          <p>Źródła mogą być chwilowo niedostępne. Pozostałe wyniki raportu nadal działają.</p>
          <RetryButton className="mt-3" isRetrying={isRetrying} onRetry={onRetry} />
        </div>
      </div>
    </section>
  );
}

function TerrainOverview({ terrain }: { terrain: TerrainAvailable }) {
  const { metrics } = terrain;
  const summary =
    metrics.typicalSlopeDegrees === null
      ? `Działka ma różnicę wysokości ${formatMeters(metrics.elevationRangeMeters)}. Brakuje próbek do wyznaczenia typowego nachylenia.`
      : `Działka ma różnicę wysokości ${formatMeters(metrics.elevationRangeMeters)}. Typowe nachylenie wynosi ${formatDegrees(metrics.typicalSlopeDegrees)}.`;

  return (
    <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
      <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">{summary}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5 [&_dd]:mt-1 [&_dd]:font-semibold [&_dd]:leading-6 [&_dd]:tabular-nums [&_dt]:text-xs [&_dt]:leading-5 [&_dt]:text-muted-foreground">
        <div>
          <dt>Najniższy punkt</dt>
          <dd>{formatMeters(metrics.minimumElevationMeters)}</dd>
        </div>
        <div>
          <dt>Najwyższy punkt</dt>
          <dd>{formatMeters(metrics.maximumElevationMeters)}</dd>
        </div>
        <div>
          <dt>Różnica wysokości</dt>
          <dd>{formatMeters(metrics.elevationRangeMeters)}</dd>
        </div>
        <div>
          <dt>Typowy spadek</dt>
          <dd>{formatDegrees(metrics.typicalSlopeDegrees)}</dd>
        </div>
        <div>
          <dt>Kierunek spadku</dt>
          <dd>{formatAspect(metrics.dominantAspect, metrics.slopeSampleCount)}</dd>
        </div>
      </dl>
    </div>
  );
}

function TerrainUnavailable({ message }: { message: string }) {
  return (
    <div className="terrain-source-unavailable">
      <CircleDashed aria-hidden="true" />
      <div>
        <strong>Model wysokościowy jest niedostępny</strong>
        <p>{message} Hydrologia i użytkowanie terenu poniżej zachowują własny stan.</p>
      </div>
    </div>
  );
}

function HydrologyContext({
  context,
  selectedId,
  highlightedId,
  onHover,
  onFocus,
  onSelect,
}: {
  context: TerrainContextResponse["surroundings"]["hydrology"];
  selectedId: string | null;
  highlightedId: string | null;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  if (context.status === "unavailable") {
    return (
      <section aria-labelledby="hydrology-context-title" className="terrain-context-panel">
        <PanelHeading icon={Droplets} id="hydrology-context-title" title="Woda w otoczeniu" />
        <div className="terrain-context-empty">
          <CircleDashed aria-hidden="true" />
          <p>
            Nie udało się pobrać warstwy obiektów wodnych. Nie oznacza to, że w pobliżu nie ma
            cieków ani zbiorników.
          </p>
        </div>
      </section>
    );
  }

  return (
    <HydrologyAvailableContext
      context={context}
      selectedId={selectedId}
      highlightedId={highlightedId}
      onSelect={onSelect}
      onHover={onHover}
      onFocus={onFocus}
    />
  );
}

function HydrologyAvailableContext({
  context,
  selectedId,
  highlightedId,
  onHover,
  onFocus,
  onSelect,
}: {
  context: HydrologyAvailable;
  selectedId: string | null;
  highlightedId: string | null;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const nearest = context.objects[0];
  const lead = context.intersectsParcel
    ? "Co najmniej jeden oznaczony obiekt wodny przecina działkę."
    : context.nearestDistanceMeters === null
      ? `W promieniu ${formatDistance(context.searchRadiusMeters)} nie znaleziono oznaczonych obiektów wodnych.`
      : `Najbliższy oznaczony obiekt wodny leży około ${formatDistance(context.nearestDistanceMeters)} od granicy działki.`;

  return (
    <section aria-labelledby="hydrology-context-title" className="terrain-context-panel">
      <PanelHeading
        badge={`Promień ${formatDistance(context.searchRadiusMeters)}`}
        icon={Droplets}
        id="hydrology-context-title"
        title="Woda w otoczeniu"
      />
      <p className="terrain-context-lead">{lead}</p>
      {context.objects.length > 0 ? (
        <ul className="terrain-hydrology-list">
          {context.objects.slice(0, 4).map((object, index) => (
            <li key={object.id}>
              <button
                aria-label={`Pokaż obiekt ${index + 1} na mapie: ${object.name ?? HYDROLOGY_LABELS[object.kind]}, ${formatDistance(object.distanceMeters)}`}
                aria-pressed={selectedId === object.id}
                data-highlighted={highlightedId === object.id || undefined}
                onMouseEnter={() => onHover(object.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onFocus(object.id)}
                onBlur={() => onFocus(null)}
                onClick={() => onSelect(object.id)}
                type="button"
              >
                <span className="hydrology-object-number">{index + 1}</span>
                <span>
                  <strong>{object.name ?? HYDROLOGY_LABELS[object.kind]}</strong>
                  {object.name && <small>{HYDROLOGY_LABELS[object.kind]}</small>}
                </span>
                <span>
                  {object.relation === "intersects-parcel"
                    ? "na działce"
                    : formatDistance(object.distanceMeters)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="terrain-context-empty compact">
          <CircleDashed aria-hidden="true" />
          <p>
            Brak oznaczeń w źródle nie potwierdza braku rowów, małych cieków ani okresowych
            podmokłości w terenie.
          </p>
        </div>
      )}
      {nearest && context.objectCount > context.objects.slice(0, 4).length && (
        <p className="terrain-context-footnote">
          Pokazano {Math.min(4, context.objects.length)} z {context.objectCount} rozpoznanych
          obiektów, w kolejności od najbliższego.
        </p>
      )}
    </section>
  );
}

function LandUseContext({
  context,
}: {
  context: TerrainContextResponse["surroundings"]["landUse"];
}) {
  if (context.status === "unavailable") {
    return (
      <section aria-labelledby="land-use-context-title" className="terrain-context-panel">
        <PanelHeading icon={LandPlot} id="land-use-context-title" title="Użytkowanie działki" />
        <div className="terrain-context-empty">
          <CircleDashed aria-hidden="true" />
          <p>
            Nie udało się pobrać klas użytkowania powierzchni. Brak danych nie został przypisany do
            żadnej kategorii.
          </p>
        </div>
      </section>
    );
  }

  return <LandUseAvailableContext context={context} />;
}

function LandUseAvailableContext({ context }: { context: LandUseAvailable }) {
  const unknownPercent = Math.max(0, 100 - context.coveragePercent);
  return (
    <section aria-labelledby="land-use-context-title" className="terrain-context-panel">
      <PanelHeading
        badge={`${formatPercent(context.coveragePercent)} rozpoznane`}
        icon={LandPlot}
        id="land-use-context-title"
        title="Użytkowanie działki"
      />
      <p className="terrain-context-lead">
        {context.dominantClass
          ? `Największy rozpoznany udział mają: ${LAND_USE_LABELS[context.dominantClass].toLocaleLowerCase("pl-PL")}.`
          : "Źródło nie zawiera polygonów pozwalających scharakteryzować tę działkę."}
      </p>
      {context.classes.length > 0 ? (
        <div className="terrain-land-use-list">
          {context.classes.slice(0, 5).map((landClass) => (
            <div className="terrain-land-use-item" key={landClass.kind}>
              <div>
                <span>{LAND_USE_LABELS[landClass.kind]}</span>
                <strong>{formatPercent(landClass.areaPercent)}</strong>
              </div>
              <div
                aria-label={`${LAND_USE_LABELS[landClass.kind]}: około ${formatPercent(landClass.areaPercent)} powierzchni działki`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={landClass.areaPercent}
                className="terrain-land-use-track"
                role="progressbar"
              >
                <span style={{ width: `${landClass.areaPercent}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="terrain-context-empty compact">
          <CircleDashed aria-hidden="true" />
          <p>Cała powierzchnia pozostaje nierozpoznana w użytej warstwie społecznościowej.</p>
        </div>
      )}
      {unknownPercent > 0.5 && (
        <p className="terrain-context-footnote">
          Nierozpoznane pozostaje około {formatPercent(unknownPercent)} powierzchni. Nie wypełniamy
          tej części domyślną klasą.
        </p>
      )}
    </section>
  );
}

function PanelHeading({
  badge,
  icon: Icon,
  id,
  title,
}: {
  badge?: string;
  icon: typeof Droplets;
  id: string;
  title: string;
}) {
  return (
    <header className="terrain-context-panel-heading">
      <span>
        <Icon aria-hidden="true" />
        <h3 id={id}>{title}</h3>
      </span>
      {badge && <Badge>{badge}</Badge>}
    </header>
  );
}

function TerrainSourceDetails({
  result,
  textureMetadata,
}: {
  result: TerrainContextResponse;
  textureMetadata?: Pick<TerrainTextureResponse, "source" | "limitations">;
}) {
  const surroundingsSource =
    result.surroundings.hydrology.status === "available"
      ? result.surroundings.hydrology.source
      : result.surroundings.landUse.status === "available"
        ? result.surroundings.landUse.source
        : null;
  const limitations = [
    ...(result.terrain.status === "available" ? result.terrain.limitations : []),
    ...(result.surroundings.hydrology.status === "available"
      ? result.surroundings.hydrology.limitations
      : []),
    ...(result.surroundings.landUse.status === "available"
      ? result.surroundings.landUse.limitations
      : []),
  ].filter((value, index, values) => values.indexOf(value) === index);

  return (
    <div className="source-details source-sections">
      {result.terrain.status === "available" && (
        <section>
          <h3 className="font-semibold text-foreground">Model wysokościowy</h3>
          <p className="mt-1">
            <strong>{result.terrain.source.dataset}</strong> · {result.terrain.source.provider} ·{" "}
            {result.terrain.source.verticalReference}
          </p>
          <p className="mt-1">
            Pobrano {formatTimestamp(result.terrain.source.retrievedAt)}. Rozdzielczość siatki:
            około {formatMeters(result.terrain.grid.cellSizeMeters)}. Usługa nie podała daty
            pozyskania arkusza.
          </p>
        </section>
      )}
      {textureMetadata && (
        <section>
          <h3 className="font-semibold text-foreground">Zdjęcie terenu</h3>
          <p className="mt-1">
            <strong>{textureMetadata.source.dataset}</strong> · {textureMetadata.source.provider} ·
            pobrano {formatTimestamp(textureMetadata.source.retrievedAt)}. Data zdjęcia źródłowego
            nie została podana.
          </p>
        </section>
      )}
      {surroundingsSource && (
        <section>
          <h3 className="font-semibold text-foreground">Hydrologia i użytkowanie terenu</h3>
          <p className="mt-1">
            <strong>{surroundingsSource.dataset}</strong> · {surroundingsSource.provider} · stan
            bazy {formatTimestamp(surroundingsSource.snapshotAt)} · pobrano{" "}
            {formatTimestamp(surroundingsSource.retrievedAt)}.
          </p>
          <p className="mt-1">
            Warunki użycia: {surroundingsSource.usageTerms}.{" "}
            <a
              className="font-semibold text-primary underline underline-offset-2"
              href={surroundingsSource.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Informacje o źródle i licencji
            </a>
            .
          </p>
        </section>
      )}
      {limitations.length > 0 && (
        <section className="border-t border-border pt-4">
          <h3 className="font-semibold text-foreground">Ograniczenia</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TerrainResult({
  parcel,
  result,
  onRetry,
  isRetrying,
  retryFailed,
}: {
  parcel: ParcelResponse;
  result: TerrainContextResponse;
  onRetry: () => void;
  isRetrying: boolean;
  retryFailed: boolean;
}) {
  const print = useReportPrint();
  const parcelIdentifier = parcel.identifier;
  const { ref, isNear, activate } = useNearViewport();
  const [mapView, setMapView] = useState<"terrain" | "water">(
    result.terrain.status === "available" ? "terrain" : "water",
  );
  const [selectedWaterId, setSelectedWaterId] = useState<string | null>(null);
  const [hoveredWaterId, setHoveredWaterId] = useState<string | null>(null);
  const [focusedWaterId, setFocusedWaterId] = useState<string | null>(null);
  const highlightedWaterId = hoveredWaterId ?? focusedWaterId ?? selectedWaterId;
  const hydrology = result.surroundings.hydrology;
  const hasWaterObjects = hydrology.status === "available" && hydrology.objects.length > 0;
  function selectWaterObject(id: string | null) {
    setSelectedWaterId(id);
    setMapView("water");
  }
  const [textureMetadata, setTextureMetadata] = useState<
    Pick<TerrainTextureResponse, "source" | "limitations"> | undefined
  >();
  const availableCount = [
    result.terrain.status === "available",
    result.surroundings.hydrology.status === "available",
    result.surroundings.landUse.status === "available",
  ].filter(Boolean).length;

  return (
    <section aria-labelledby="terrain-context-title" className="terrain-section">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <ReportSectionHeader
          description="Rzeźba terenu, pobliskie obiekty wodne i pokrycie powierzchni Twojej działki."
          icon={LandPlot}
          id="terrain-context-title"
          source={{
            content: <TerrainSourceDetails result={result} textureMetadata={textureMetadata} />,
            description:
              "Pochodzenie, aktualność i ograniczenia danych o terenie, wodzie i użytkowaniu powierzchni.",
            title: "Źródła terenu i otoczenia",
          }}
          status={
            <Badge
              title={`Dostępne zakresy danych: ${availableCount} z 3`}
              variant={availableCount === 3 ? "success" : "warning"}
            >
              {availableCount === 3 ? (
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
              ) : (
                <AlertTriangle aria-hidden="true" className="size-3.5" />
              )}
              {availableCount === 3
                ? "Dane dostępne"
                : availableCount === 0
                  ? "Brak danych"
                  : "Część danych"}
            </Badge>
          }
          title="Teren, woda i użytkowanie działki"
        />
        {!print && result.status !== "complete" && (
          <div className="mt-4" aria-live="polite">
            <RetryButton isRetrying={isRetrying} onRetry={onRetry}>
              Ponów pobieranie brakujących danych
            </RetryButton>
            {retryFailed && (
              <p className="mt-2 text-sm text-muted-foreground" role="alert">
                Nie udało się odświeżyć danych. Nadal pokazujemy ostatni pobrany wynik.
              </p>
            )}
          </div>
        )}
      </div>

      {mapView === "terrain" && result.terrain.status === "available" && (
        <TerrainOverview terrain={result.terrain} />
      )}
      {result.terrain.status === "unavailable" && (
        <TerrainUnavailable
          message={
            result.terrain.reason === "no-data"
              ? "Nie uzyskano użytecznych próbek wysokości w granicach tej działki."
              : "Nie udało się pobrać modelu terenu z GUGiK. To nie potwierdza braku danych dla tej działki."
          }
        />
      )}
      {print && (
        <PrintParcelMap
          parcel={parcel}
          hydrology={hydrology.status === "available" ? hydrology : null}
        />
      )}
      {!print && (
        <div className="terrain-spatial-view">
          {hasWaterObjects && (
            <fieldset className="terrain-model-controls">
              <legend className="sr-only">Widok działki i otoczenia</legend>
              {result.terrain.status === "available" && (
                <button
                  aria-pressed={mapView === "terrain"}
                  onClick={() => {
                    setMapView("terrain");
                    activate();
                  }}
                  type="button"
                >
                  <Rotate3D aria-hidden="true" />
                  Teren 3D
                </button>
              )}
              <button
                aria-pressed={mapView === "water"}
                onClick={() => {
                  setSelectedWaterId(null);
                  setMapView("water");
                }}
                type="button"
              >
                <Droplets aria-hidden="true" />
                Woda na mapie
              </button>
            </fieldset>
          )}
          {mapView === "water" && hasWaterObjects && hydrology.status === "available" ? (
            <Suspense
              fallback={
                <div className="terrain-model-placeholder">
                  <Spinner label="Ładowanie mapy obiektów wodnych…" />
                </div>
              }
            >
              <HydrologyMap
                parcel={parcel}
                hydrology={hydrology}
                selectedId={selectedWaterId}
                highlightedId={highlightedWaterId}
                onSelect={selectWaterObject}
                onHover={setHoveredWaterId}
              />
            </Suspense>
          ) : result.terrain.status === "available" ? (
            <div className="terrain-model-lazy" ref={ref}>
              {isNear ? (
                <Suspense
                  fallback={
                    <div className="terrain-model-placeholder">
                      <Spinner label="Ładowanie widoku 3D…" />
                    </div>
                  }
                >
                  <TerrainModel
                    key={parcelIdentifier}
                    onTextureMetadata={setTextureMetadata}
                    parcelIdentifier={parcelIdentifier}
                    terrain={result.terrain}
                  />
                </Suspense>
              ) : (
                <div className="terrain-model-placeholder">
                  <Rotate3D aria-hidden="true" />
                  <span>Widok 3D uruchomi się, gdy przewiniesz bliżej.</span>
                  <Button onClick={activate} type="button" variant="outline">
                    Wczytaj widok 3D
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="terrain-surroundings">
        <HydrologyContext
          context={hydrology}
          selectedId={mapView === "water" ? selectedWaterId : null}
          highlightedId={highlightedWaterId}
          onSelect={selectWaterObject}
          onHover={setHoveredWaterId}
          onFocus={setFocusedWaterId}
        />
        <LandUseContext context={result.surroundings.landUse} />
      </div>

      {!print && (
        <section
          aria-label="Źródła i ograniczenia danych przestrzennych"
          className="hidden border-t border-border pt-5 print:block"
        >
          <h3 className="mb-3 text-sm font-semibold">Źródła i ograniczenia</h3>
          <TerrainSourceDetails result={result} textureMetadata={textureMetadata} />
        </section>
      )}
    </section>
  );
}

export function TerrainContextSection({ parcel }: { parcel: ParcelResponse }) {
  const query = useQuery({
    queryKey: ["terrain-context", parcel.identifier],
    queryFn: ({ signal }) => getTerrainContext(parcel.identifier, signal),
    retry: 1,
    staleTime: (query) => (query.state.data?.status === "complete" ? 30 * 60 * 1_000 : 0),
  });

  if (query.isPending) return <TerrainLoading />;
  if (query.isError && !query.data) {
    return <TerrainError isRetrying={query.isFetching} onRetry={() => void query.refetch()} />;
  }
  return (
    <TerrainResult
      key={parcel.identifier}
      parcel={parcel}
      result={query.data}
      onRetry={() => void query.refetch()}
      isRetrying={query.isFetching}
      retryFailed={query.isRefetchError}
    />
  );
}

import { RetryButton } from "../../components/RetryButton";
