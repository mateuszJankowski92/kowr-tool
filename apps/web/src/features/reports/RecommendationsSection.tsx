import {
  CROP_CATALOG,
  type Crop,
  type ParcelResponse,
  type RecommendationItem,
} from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Droplets,
  Info,
  Layers2,
  Lightbulb,
  type LucideIcon,
  MapPin,
  Route,
  ScanSearch,
  ShieldCheck,
  Sprout,
  Waves,
} from "lucide-react";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { createWaterAssessmentRequest, getWaterAssessment } from "../../api/analyses";
import { createRecommendationContext, getRecommendations } from "../../api/recommendations";
import { getSoilProfile } from "../../api/soil-profiles";
import { getTerrainContext } from "../../api/terrain-context";
import { RetryButton } from "../../components/RetryButton";
import { Badge } from "../../components/ui/badge";
import { Spinner } from "../../components/ui/spinner";
import { PrintParcelMap } from "./PrintParcelMap";
import { ReportSectionHeader } from "./ReportSectionHeader";
import { useReportPrint } from "./report-print-context";

const RetentionLocationsMap = lazy(() =>
  import("./RetentionLocationsMap").then((module) => ({ default: module.RetentionLocationsMap })),
);

type RecommendationsSectionProps = {
  parcel?: ParcelResponse;
  analysisDate: string;
  crop: Crop;
  parcelIdentifier: string;
  seasonStartDate?: string;
};

const PRESENTATION: Record<
  RecommendationItem["id"],
  { title: string; action: string; why: string; icon: LucideIcon }
> = {
  "protect-soil-surface": {
    icon: Sprout,
    title: "Ogranicz okresy z odkrytą glebą",
    action:
      "Rozważ międzyplon, pozostawienie resztek lub inne okrycie gleby dopasowane do płodozmianu.",
    why: "Model wskazuje ograniczenie poboru wody na powierzchni rozpoznanej jako użytkowana rolniczo.",
  },
  "manage-perennial-cover": {
    icon: Sprout,
    title: "Dostosuj okrywę gleby do uprawy wieloletniej",
    action:
      "Utrzymuj ochronę powierzchni gleby, dobierając okrywę i jej koszenie do gatunku oraz dostępnej wody.",
    why: "Profil wybranej uprawy jest wieloletni, a model wskazuje ograniczenie poboru wody. Nowa okrywa wymaga sprawdzenia konkurencji o wodę.",
  },
  "build-soil-organic-matter": {
    icon: Layers2,
    title: "Zaplanuj utrzymanie materii organicznej",
    action:
      "Dobierz praktyki zachowujące resztki i budujące materię organiczną zgodnie z bilansem składników oraz płodozmianem.",
    why: "Zdolność gleby do magazynowania wody pochodzi z modelu SoilGrids i uczestniczyła w bilansie FAO-56.",
  },
  "review-contour-practices": {
    icon: Route,
    title: "Sprawdź kierunek przejazdów i pasy spowalniające odpływ",
    action:
      "W terenie oceń prowadzenie zabiegów w poprzek dominującego spadku oraz miejsca dla pasów roślinnych.",
    why: "Model wysokościowy pokazuje zróżnicowanie terenu, na którym przebieg odpływu wymaga potwierdzenia w polu.",
  },
  "inspect-nearby-water-network": {
    icon: Waves,
    title: "Sprawdź istniejący ciek, rów lub zbiornik",
    action:
      "Oceń jego stan, kierunek przepływu i funkcję. Nie blokuj ani nie przebudowuj obiektu bez sprawdzenia własności i wymagań prawnych.",
    why: "Oznaczony obiekt wodny leży na działce albo nie dalej niż 100 m od jej granicy.",
  },
  "survey-distributed-retention": {
    icon: Droplets,
    title: "Rozpoznaj miejsca dla małej, rozproszonej retencji",
    action:
      "Zleć terenowe sprawdzenie obniżeń i dróg odpływu przed wyborem miejsca lub rodzaju działania.",
    why: "Model wskazuje ograniczenie dostępności wody, a NMT pozwala rozpocząć rozpoznanie rzeźby terenu.",
  },
  "verify-field-conditions": {
    icon: ScanSearch,
    title: "Potwierdź warunki bezpośrednio na polu",
    action:
      "Sprawdź wilgotność gleby w strefie korzeniowej, fazę uprawy i objawy roślin przed kosztowną interwencją.",
    why: "Wynik jest niepełny, zależny od scenariusza albo obserwacja satelitarna nie jest zgodna z bilansem.",
  },
  "maintain-water-conservation-practices": {
    icon: ShieldCheck,
    title: "Utrzymuj praktyki ograniczające niepotrzebną utratę wody",
    action:
      "Nie zmieniaj działającego systemu wyłącznie na podstawie tego raportu; kontynuuj okrycie i ochronę struktury gleby.",
    why: "Kompletne scenariusze nie wskazują ograniczenia w ocenionym okresie poboru wody na gruncie rolnym.",
  },
};

const MISSING_LABELS: Record<RecommendationItem["missingInputs"][number], string> = {
  "current-field-soil-moisture": "terenowy pomiar wilgotności gleby",
  "confirmed-crop-growth-stage": "potwierdzona faza rozwoju uprawy",
  "field-management-history": "historia zabiegów i płodozmianu",
  "detailed-runoff-survey": "terenowy przebieg odpływu i mikrorzeźba",
  "drainage-ownership-and-condition": "własność i stan urządzeń melioracyjnych",
  "legal-and-environmental-constraints": "uwarunkowania prawne i środowiskowe",
};

const VERIFICATION_LABELS: Record<RecommendationItem["verification"][number], string> = {
  "field-inspection": "oględziny w terenie",
  "agronomist-review": "konsultacja agronomiczna",
  "survey-and-design": "pomiar i projekt techniczny",
  "formal-and-legal-check": "sprawdzenie formalnoprawne",
};

const EVIDENCE_LABELS: Record<RecommendationItem["evidence"][number]["code"], string> = {
  "modelled-water-stress": "modelowane ograniczenie poboru wody",
  "no-modelled-water-stress": "brak modelowanego ograniczenia w kompletnych scenariuszach",
  "scenario-disagreement": "rozbieżne wnioski scenariuszy",
  "agricultural-land-use": "rozpoznane użytkowanie rolnicze",
  "terrain-relief": "rzeźba terenu z NMT",
  "nearby-water-object": "oznaczony obiekt wodny w pobliżu",
  "water-object-on-parcel": "oznaczony obiekt wodny przecina działkę",
  "modelled-soil-profile": "modelowany profil wodny SoilGrids",
  "satellite-conflict": "obserwacja satelitarna sprzeczna z bilansem",
  "incomplete-inputs": "brak części wymaganych danych",
  "crop-root-depth": "dolny wariant maksymalnej głębokości korzeni wybranej uprawy",
};

function formatEvidence(item: RecommendationItem["evidence"][number]): string {
  if (item.value === null || item.unit === null) return EVIDENCE_LABELS[item.code];
  const value = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(item.value);
  const unit = {
    days: item.value === 1 ? "dzień" : "dni",
    millimeters: "mm",
    degrees: "°",
    meters: "m",
    percent: "%",
  }[item.unit];
  return `${EVIDENCE_LABELS[item.code]}: ${value} ${unit}`;
}

const PRACTICE_LABELS: Record<RecommendationItem["cropPractice"], string> = {
  "annual-standing": "Uprawa sezonowa w modelowanym okresie wzrostu",
  "annual-post-season": "Planowanie po zakończeniu modelowanego sezonu",
  "perennial-interrows": "Uprawa wieloletnia z rozpoznaniem okrywy międzyrzędzi",
  "perennial-sward": "Uprawa wieloletnia z ochroną istniejącej okrywy",
  unknown: "Termin lub rodzaj uprawy wymaga potwierdzenia",
};

function actionForCrop(item: RecommendationItem): string {
  if (item.id === "protect-soil-surface") {
    return item.cropPractice === "annual-post-season"
      ? "Po zbiorach rozważ pozostawienie resztek i okrywę między plonami, uwzględniając termin następnego siewu i dostępną wodę."
      : "W rosnącej uprawie ogranicz zbędne naruszanie gleby. Okrywę między plonami planuj po zbiorach; sprawdź konkurencję o wodę.";
  }
  if (item.id === "manage-perennial-cover") {
    return item.cropPractice === "perennial-interrows"
      ? "Sprawdź okrywę międzyrzędzi i jej konkurencję o wodę z rośliną główną. Dobierz koszenie lub ściółkę po ocenie wilgotności i układu rzędów."
      : "Chroń istniejącą darń lub okrywę właściwą dla gatunku. Dostosuj koszenie i przejazdy do warunków; nie traktuj plantacji jak pola po zbiorze uprawy jednorocznej.";
  }
  if (item.id === "review-contour-practices" && item.cropPractice.startsWith("perennial-")) {
    return "Sprawdź odpływ względem istniejących rzędów lub darni i możliwość pasów spowalniających wodę. Dobierz działanie do trwałego układu plantacji po oględzinach.";
  }
  return PRESENTATION[item.id].action;
}

function locationLabel(location: RecommendationItem["locations"][number]): string {
  return location.kind === "water-object"
    ? (location.name ?? "Oznaczony obiekt wodny")
    : location.kind === "low-terrain-cell"
      ? "Najniżej położone miejsce w modelu terenu"
      : "Miejsce o największym spadku w modelu terenu";
}

function RecommendationCard({
  item,
  locationNumbers,
  onSelectLocation,
}: {
  item: RecommendationItem;
  locationNumbers: Map<string, number>;
  onSelectLocation: (key: string) => void;
}) {
  const print = useReportPrint();
  const presentation = PRESENTATION[item.id];
  const priority = (
    {
      high: { label: "Wysoki", variant: "destructive" },
      medium: { label: "Średni", variant: "warning" },
      low: { label: "Niski", variant: "success" },
    } as const
  )[item.priority];
  const category = item.category === "retention" ? "retencja" : "agrotechnika";

  const Icon = presentation.icon;

  return (
    <article className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-6 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4">
      <span className="flex justify-center pt-0.5 text-primary">
        <Icon aria-hidden="true" className="size-6 sm:size-7" strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <h3 className="max-w-[60ch] text-lg font-semibold leading-7 tracking-[-0.02em]">
          {presentation.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="capitalize">{category}</span>
          <Badge title="Priorytet" variant={priority.variant}>
            {priority.label}
          </Badge>
        </div>
        <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">
          {actionForCrop(item)}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {PRACTICE_LABELS[item.cropPractice]}
        </p>
        {item.locations.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm leading-6">
            {item.locations.map((location) => (
              <li key={`${location.kind}:${location.id}`}>
                <button
                  className="rounded-sm text-left font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                  aria-controls="retention-locations"
                  onClick={() => onSelectLocation(`${location.kind}:${location.id}`)}
                >
                  Miejsce {locationNumbers.get(`${location.kind}:${location.id}`)}:{" "}
                  {locationLabel(location)}
                </button>
                <span className="block text-xs text-muted-foreground">
                  {location.source}
                  {location.kind !== "water-object"
                    ? " · w granicach działki"
                    : location.distanceMeters !== null
                      ? ` · ${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(location.distanceMeters)} m od działki`
                      : ""}
                  {location.resolutionMeters !== null
                    ? ` · komórka około ${Math.ceil(location.resolutionMeters)} m`
                    : ""}
                  . Do oględzin; nie jest to potwierdzona lokalizacja urządzenia.
                </span>
              </li>
            ))}
          </ul>
        )}
        {item.category === "retention" && item.locations.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Dane nie pozwalają wskazać konkretnego miejsca. Potrzebne jest rozpoznanie w terenie.
          </p>
        )}
        {print?.variant === "simple" && (
          <div className="mt-2 text-xs leading-5">
            <p>{item.evidence.map(formatEvidence).join("; ")}.</p>
            <p>
              Przed wdrożeniem:{" "}
              {item.verification.map((entry) => VERIFICATION_LABELS[entry]).join(", ")}.
            </p>
            {item.missingInputs.length > 0 && (
              <p>
                Brakujące informacje:{" "}
                {item.missingInputs.map((entry) => MISSING_LABELS[entry]).join(", ")}.
              </p>
            )}
          </div>
        )}
        <details
          className={`group mt-2 ${print?.variant === "simple" ? "print-extended-only" : ""}`}
        >
          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            Uzasadnienie i warunki
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="mt-1 grid gap-5 border-t border-border py-5 text-sm leading-6 text-muted-foreground md:grid-cols-2">
            <p className="max-w-[72ch] md:col-span-2">{presentation.why}</p>
            <div>
              <h4 className="font-semibold text-foreground">Co wskazują dane</h4>
              <ul className="mt-2 list-disc space-y-1 pl-4 marker:text-primary/50">
                {item.evidence.map((entry) => (
                  <li key={`${entry.code}-${entry.value}`}>{formatEvidence(entry)}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground">Przed wdrożeniem</h4>
                <p className="mt-2">
                  {item.verification.map((entry) => VERIFICATION_LABELS[entry]).join(", ")}.
                </p>
              </div>
              {item.missingInputs.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground">Brakujące informacje</h4>
                  <p className="mt-2">
                    {item.missingInputs.map((entry) => MISSING_LABELS[entry]).join(", ")}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

function RecommendationMethodDetails() {
  return (
    <div className="source-details source-sections">
      <section>
        <h3>Na czym opieramy wskazówki</h3>
        <p className="mt-2">
          Reguły łączą wynik FAO-56, model gleby, NMT, oznaczone obiekty wodne, użytkowanie terenu i
          kwalifikowaną interpretację Sentinel-2. Każda karta zachowuje przesłanki i brakujące dane.
        </p>
      </section>
      <section>
        <h3>Co oznaczają progi</h3>
        <p className="mt-2">
          Progi 1° typowego spadku, 2 m różnicy wysokości i 100 m od obiektu wodnego służą wyłącznie
          do przesiewowego wskazania tematu do sprawdzenia. Nie są kryteriami projektu budowlanego
          ani podstawą do lokalizacji urządzenia wodnego.
        </p>
      </section>
      <section>
        <h3>Przed podjęciem decyzji</h3>
        <p className="mt-2">
          Rekomendacje nie gwarantują wzrostu plonu ani oszczędności wody i nie zastępują oględzin,
          projektu technicznego, konsultacji agronomicznej ani wymaganych zgód.
        </p>
      </section>
    </div>
  );
}

export function RecommendationsSection({
  parcel,
  analysisDate,
  crop,
  parcelIdentifier,
  seasonStartDate,
}: RecommendationsSectionProps) {
  const print = useReportPrint();
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [selection, setSelection] = useState<{ key: string } | null>(null);
  const locationSectionRef = useRef<HTMLDivElement>(null);
  const assessmentRequest = createWaterAssessmentRequest({
    analysisDate,
    crop,
    parcelIdentifier,
    seasonStartDate,
  });
  const assessmentQuery = useQuery({
    queryKey: ["water-assessment", parcelIdentifier, crop, analysisDate, seasonStartDate],
    queryFn: ({ signal }) => getWaterAssessment(assessmentRequest, signal),
    retry: false,
    staleTime: 30 * 60 * 1_000,
  });
  const terrainQuery = useQuery({
    queryKey: ["terrain-context", parcelIdentifier],
    queryFn: ({ signal }) => getTerrainContext(parcelIdentifier, signal),
    retry: false,
    staleTime: 30 * 60 * 1_000,
  });
  const soilQuery = useQuery({
    queryKey: ["soil-profile", parcelIdentifier],
    queryFn: ({ signal }) => getSoilProfile(parcelIdentifier, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const context =
    !assessmentQuery.isPending && !terrainQuery.isPending && !soilQuery.isPending
      ? createRecommendationContext({
          crop,
          assessment: assessmentQuery.data ?? null,
          soil: soilQuery.data ?? null,
          terrain: terrainQuery.data ?? null,
        })
      : null;
  const recommendationQuery = useQuery({
    queryKey: ["recommendations", context],
    queryFn: ({ signal }) => getRecommendations(context as NonNullable<typeof context>, signal),
    enabled: context !== null,
    retry: false,
    staleTime: 30 * 60 * 1_000,
  });
  const isLoading =
    assessmentQuery.isPending ||
    terrainQuery.isPending ||
    soilQuery.isPending ||
    (context !== null && recommendationQuery.isPending);
  const isError = recommendationQuery.isError;
  const missingSources = context
    ? [
        ...(assessmentQuery.isError ? ["ocena wodna"] : []),
        ...(["unavailable", "no-data"].includes(context.soil.status) ? ["profil gleby"] : []),
        ...(context.terrain.status === "unavailable" ? ["rzeźba terenu"] : []),
        ...(context.hydrology.status === "unavailable" ? ["obiekty wodne"] : []),
        ...(context.landUse.status === "unavailable" || context.landUse.dominantClass === null
          ? ["użytkowanie działki"]
          : []),
      ]
    : [];
  const retryMissingSources = () => {
    if (assessmentQuery.isError) void assessmentQuery.refetch();
    if (context?.soil.status !== "complete") void soilQuery.refetch();
    if (
      context?.terrain.status === "unavailable" ||
      context?.hydrology.status === "unavailable" ||
      context?.landUse.status === "unavailable" ||
      context?.landUse.dominantClass === null
    ) {
      void terrainQuery.refetch();
    }
  };

  const completedSeasonDate =
    assessmentQuery.data?.completedSeason?.evaluation?.evaluatedThroughDate ??
    (assessmentQuery.data?.evaluation?.scope === "completed-season"
      ? assessmentQuery.data.evaluation.evaluatedThroughDate
      : null);
  const locations = useMemo(
    () => [
      ...new Map(
        (recommendationQuery.data?.items ?? [])
          .flatMap((item) => item.locations)
          .map((location) => [`${location.kind}:${location.id}`, location]),
      ).values(),
    ],
    [recommendationQuery.data],
  );
  const locationNumbers = new Map(
    locations.map((location, index) => [`${location.kind}:${location.id}`, index + 1]),
  );

  return (
    <section
      aria-labelledby="recommendations-title"
      className="rounded-2xl bg-card p-5 shadow-[0_14px_38px_rgba(15,37,25,0.10)] sm:p-6"
    >
      <ReportSectionHeader
        description="Wskazówki dopasowane do warunków Twojej działki. Przed wdrożeniem sprawdź je na polu."
        icon={Lightbulb}
        id="recommendations-title"
        source={{
          content: <RecommendationMethodDetails />,
          description: "Zakres danych, reguły przesiewowe i ograniczenia silnika rekomendacji.",
          title: "Jak wybrano rekomendacje",
        }}
        status={
          recommendationQuery.data ? (
            <Badge variant={recommendationQuery.data.status === "complete" ? "success" : "warning"}>
              {recommendationQuery.data.status === "complete" ? (
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
              ) : (
                <AlertTriangle aria-hidden="true" className="size-3.5" />
              )}
              {recommendationQuery.data.status === "complete" ? "Pełny kontekst" : "Część danych"}
            </Badge>
          ) : undefined
        }
        title="Co możesz zrobić na tej działce"
      />

      <p className="mt-3 text-sm text-muted-foreground">
        Dla uprawy: {CROP_CATALOG.find((entry) => entry.id === crop)?.label ?? crop}.
      </p>
      {completedSeasonDate && (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Działania uwzględniają zakończony okres uprawy do{" "}
          {new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "UTC" }).format(
            new Date(`${completedSeasonDate}T00:00:00Z`),
          )}
          , a nie bieżącą wilgotność gleby. Mogą pomóc w planowaniu kolejnego sezonu.
        </p>
      )}

      {!isLoading && missingSources.length > 0 && (
        <div className="mt-4 rounded-xl bg-secondary p-4" role="status">
          <p className="text-sm leading-6">
            Część danych jest niedostępna: {missingSources.join(", ")}. Działania opierają się na
            pozostałych źródłach. Brak oceny wodnej nie oznacza braku niedoboru.
          </p>
          <RetryButton
            className="mt-2"
            isRetrying={
              assessmentQuery.isFetching || terrainQuery.isFetching || soilQuery.isFetching
            }
            onRetry={retryMissingSources}
          >
            Ponów pobieranie brakujących danych
          </RetryButton>
        </div>
      )}

      {isLoading ? (
        <div
          aria-label="Dobieranie rekomendacji"
          className="mt-6 space-y-4 border-t border-border pt-6"
          role="status"
        >
          <div className="h-36 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
          <div className="h-36 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
        </div>
      ) : isError ? (
        <div className="mt-5 rounded-xl bg-destructive/10 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 text-destructive" />
            <div>
              <h3 className="font-semibold">Nie udało się dobrać rekomendacji</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Pozostałe wyniki raportu są nadal dostępne. Spróbuj ponownie po odświeżeniu danych.
              </p>
              <RetryButton
                className="mt-3"
                isRetrying={recommendationQuery.isFetching}
                onRetry={() => void recommendationQuery.refetch()}
              >
                Spróbuj ponownie
              </RetryButton>
            </div>
          </div>
        </div>
      ) : recommendationQuery.data && recommendationQuery.data.items.length > 0 ? (
        <div className="mt-6 divide-y divide-border border-y border-border">
          {recommendationQuery.data.items.map((item) => (
            <RecommendationCard
              item={item}
              key={item.id}
              locationNumbers={locationNumbers}
              onSelectLocation={(key) => {
                setSelection({ key });
                setShowLocationMap(true);
                locationSectionRef.current?.focus({ preventScroll: true });
                locationSectionRef.current?.scrollIntoView?.({ block: "start" });
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary p-4">
          <ClipboardCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-6">
            Brakuje danych pozwalających wskazać działanie inne niż zebranie informacji w terenie.
          </p>
        </div>
      )}

      {locations.length > 0 && (
        <div
          className="mt-6 scroll-mt-6 border-t border-border pt-5"
          id="retention-locations"
          ref={locationSectionRef}
          tabIndex={-1}
        >
          <h3 className="text-base font-semibold">Miejsca do oględzin</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Numery odpowiadają wskazaniom przy zaleceniach. Punkty NMT reprezentują komórki siatki,
            nie rozpoznane zagłębienia ani drogi odpływu.
          </p>
          {parcel && print?.variant === "extended" && (
            <PrintParcelMap parcel={parcel} locations={locations} />
          )}
          {parcel && !print && (
            <details
              className="group/map mt-3"
              open={showLocationMap}
              onToggle={(event) => {
                setShowLocationMap(event.currentTarget.open);
              }}
            >
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <MapPin aria-hidden="true" className="size-4" />
                Pokaż miejsca na mapie
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-open/map:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              {showLocationMap && (
                <Suspense fallback={<Spinner label="Wczytywanie mapy miejsc…" />}>
                  <RetentionLocationsMap
                    parcel={parcel}
                    locations={locations}
                    selection={selection}
                  />
                </Suspense>
              )}
            </details>
          )}
        </div>
      )}
      <p className="mt-5 flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="max-w-[90ch]">
          Nie wyznaczamy automatycznie lokalizacji zbiorników ani urządzeń wodnych. Każda zmiana
          odpływu lub obiektu wodnego wymaga potwierdzenia w terenie i oceny formalnoprawnej.
        </span>
      </p>
    </section>
  );
}
