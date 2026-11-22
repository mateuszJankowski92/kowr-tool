import type {
  Crop,
  WaterAssessmentLimitation,
  WaterAssessmentReasonCode,
  WaterAssessmentResponse,
} from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  Droplets,
  HelpCircle,
} from "lucide-react";
import { createWaterAssessmentRequest, getWaterAssessment } from "../../api/analyses";
import { ApiClientError } from "../../api/request-json";
import { RetryButton } from "../../components/RetryButton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { CropModelNotice } from "./CropModelNotice";
import { ReportSectionHeader } from "./ReportSectionHeader";
import { RequestedDateConditions, RequestedDateConditionsDetails } from "./RequestedDateConditions";
import { useReportPrint } from "./report-print-context";
import { WaterScenarioComparison } from "./WaterScenarioComparison";

const REASON_LABELS: Record<WaterAssessmentReasonCode, string> = {
  CROP_PROFILE_UNSUPPORTED:
    "Ta pozycja katalogu nie opisuje rośliny polowej. Bilans FAO-56 strefy korzeniowej nie ma tu zastosowania.",
  PHENOLOGY_REQUIRED: "Do obliczenia potrzebna jest data siewu lub sadzenia.",
  PHENOLOGY_REFERENCE_UNAVAILABLE:
    "Dostępne źródła nie zawierają odpowiedniego przebiegu faz rozwoju tej uprawy.",
  ANALYSIS_OUTSIDE_MODELED_SEASON:
    "Wybrana data wypada poza okresem wzrostu co najmniej jednego wariantu rozwoju uprawy.",
  WEATHER_UNAVAILABLE: "Nie udało się pobrać wymaganych danych pogodowych.",
  WEATHER_SERIES_INCOMPLETE: "W szeregu pogodowym brakuje co najmniej jednego wymaganego dnia.",
  SOIL_PROFILE_UNAVAILABLE: "Nie udało się pobrać modelowanego profilu wodnego gleby.",
  SOIL_PROFILE_INCOMPLETE: "Profil gleby nie obejmuje wszystkich wartości wymaganych przez model.",
  MODELLED_STRESS_IN_ALL_SCENARIOS:
    "Wszystkie wymagane scenariusze wskazują ograniczenie poboru wody w dniu analizy.",
  NO_MODELLED_STRESS_IN_ALL_SCENARIOS:
    "Żaden kompletny scenariusz nie wskazuje ograniczenia poboru wody w dniu analizy.",
  SCENARIO_CONCLUSIONS_DISAGREE:
    "Wiarygodne scenariusze prowadzą do różnych wniosków o dostępności wody.",
  REQUIRED_SCENARIO_INCOMPLETE:
    "Co najmniej jednego wymaganego scenariusza nie można było obliczyć do końca.",
  SATELLITE_UNAVAILABLE: "Dodatkowa obserwacja satelitarna nie była dostępna.",
};

const LIMITATION_LABELS: Record<WaterAssessmentLimitation, string> = {
  SINGLE_CROP_COEFFICIENT_APPROXIMATION:
    "Bilans korzysta z uproszczonego, pojedynczego współczynnika uprawowego.",
  MODELLED_SOIL_PROPERTIES:
    "Właściwości gleby pochodzą z modelu SoilGrids, a nie z badania polowego.",
  PHENOLOGY_NOT_POLAND_CALIBRATED:
    "Referencyjne długości faz rozwoju nie są kalibracją fenologii dla Polski.",
  INITIAL_SUBSOIL_WATER_BRACKETED_BY_EXTREMES:
    "Początkowy zapas wody ujęto w dwóch skrajnych wariantach.",
  UNKNOWN_WETTING_TIME_BRACKETED:
    "Nieznaną porę opadu ujęto w wariancie wczesnego i późnego zwilżenia.",
  UNKNOWN_FLUXES_ASSUMED_ZERO:
    "Brak danych o nawadnianiu, spływie i podsiąku; w modelu przyjęto wartości zerowe.",
  STRONG_CLASSIFICATION_DISABLED:
    "Model nie nadaje osobnej klasy silnych przesłanek bez zatwierdzonego progu.",
  RAINFED_FULL_INFILTRATION_ASSUMPTION:
    "Obliczenia zakładają uprawę bez nawadniania i pełne wsiąkanie opadu.",
  WEATHER_POINT_MODEL: "Pogoda reprezentuje punkt modelu, a nie pomiar wykonany na działce.",
  WEATHER_OPERATIONAL_MODEL_NOT_FIXED_REANALYSIS:
    "Użyto świeższej analizy operacyjnej ECMWF IFS. To odrębny model od archiwalnego ERA5; jego wersje zmieniają się w czasie.",
  WEATHER_SERIES_INCOMPLETE: "Szereg pogodowy jest niekompletny.",
  WEATHER_FALLBACK_TIME_STANDARD_DIFFERS:
    "Zapasowe źródło pogody używa innego standardu czasu dobowego.",
  SOIL_SINGLE_MODEL_CELL:
    "Profil gleby reprezentuje pojedynczą komórkę modelu o rozdzielczości 250 m.",
  SOIL_NOT_CURRENT_MOISTURE: "SoilGrids nie mierzy aktualnej wilgotności gleby.",
  SOIL_NOT_DATE_SPECIFIC: "Model gleby nie jest przypisany do wybranej daty analizy.",
  HISTORICAL_CROP_NOT_CONFIRMED:
    "Nie potwierdzono, że wybrana uprawa rosła na działce w analizowanym roku.",
  ANALYSIS_DAY_WEATHER_ONLY:
    "Bez aktywnej fenologii dostępny jest kontekst pogodowy, bez oceny stresu uprawy.",
  SATELLITE_NOT_USED_IN_BALANCE:
    "Obserwacja satelitarna nie zmienia klasy obliczonej przez bilans FAO-56.",
};

const CROP_PROFILE_LABELS: Record<
  NonNullable<WaterAssessmentResponse["crop"]["profileId"]>,
  string
> = {
  "grain-maize": "kukurydza na ziarno",
  potato: "ziemniak",
  rapeseed: "rzepak",
  "spring-wheat": "pszenica jara",
  "sugar-beet": "burak cukrowy",
  "winter-wheat": "pszenica ozima",
  "spring-rye": "żyto jare",
  "winter-rye": "żyto ozime",
  "winter-barley": "jęczmień ozimy",
  "spring-rapeseed": "rzepak jary",
  buckwheat: "gryka zwyczajna",
  strawberry: "truskawka",
};

type ResultPresentation = {
  description: string;
  note?: string;
  title: string;
  tone: "positive" | "warning" | "neutral" | "muted";
};

function initialWaterSummary(result: WaterAssessmentResponse): string | null {
  const rangeFor = (initialCondition: "field-capacity" | "wilting-point") => {
    const days = result.scenarios.results
      .filter(
        (scenario) =>
          scenario.status === "complete" &&
          scenario.configuration.initialCondition === initialCondition,
      )
      .map((scenario) => scenario.summary.stressDays);
    if (days.length === 0) return null;
    return { minimum: Math.min(...days), maximum: Math.max(...days) };
  };
  const wet = rangeFor("field-capacity");
  const dry = rangeFor("wilting-point");
  if (!wet || !dry || (wet.minimum === dry.minimum && wet.maximum === dry.maximum)) return null;
  const daysLabel = (range: { minimum: number; maximum: number }) =>
    formatScenarioRange(range, range.minimum === 1 && range.maximum === 1 ? "dzień" : "dni");
  return `Jeśli na początku okresu gleba była mokra, według modelu uprawie mogło brakować wody przez ${daysLabel(wet)}, a jeśli była skrajnie sucha — przez ${daysLabel(dry)}.`;
}

function getResultPresentation(result: WaterAssessmentResponse): ResultPresentation {
  if (result.evaluation?.scope === "completed-season" && result.scenarios.completeCount > 0) {
    const complete = result.scenarios.completeCount === result.scenarios.totalCount;
    const days = result.scenarios.stressDays;
    return {
      title: "Wynik zakończonego okresu uprawy",
      description:
        initialWaterSummary(result) ??
        (days
          ? `Według modelu uprawie mogło brakować wody przez ${formatScenarioRange(days, days.minimum === 1 && days.maximum === 1 ? "dzień" : "dni")} w zakończonym okresie uprawy.`
          : "Brak podsumowania liczby dni, w których uprawie mogło brakować wody."),
      note: `${complete ? "" : "Ukończono tylko część wariantów. "}Ten wynik nie opisuje wilgotności gleby w dniu ${formatDate(result.analysisDate)}.`,
      tone: "neutral",
    };
  }
  if (result.phenology.status === "outside-active-season") {
    return {
      title: "Wybrana uprawa jest poza modelowanym okresem aktywnego wzrostu",
      description:
        "Wybrana data jest przed początkiem lub po końcu modelowanego sezonu. Nie można dla niej ocenić poboru wody przez tę uprawę. Sprawdź datę analizy i założony termin siewu lub sadzenia.",
      tone: "muted",
    };
  }

  if (result.assessmentLevel === "limited-fao56") {
    const availableConclusion =
      result.availableScenarioConclusion === "consistent-stress"
        ? "Dostępne warianty wskazują ograniczenie poboru wody."
        : result.availableScenarioConclusion === "consistent-no-stress"
          ? "Dostępne warianty nie wskazują ograniczenia, ale brakujące warianty mogłyby zmienić ten wniosek."
          : "Dostępne warianty prowadzą do różnych wniosków.";
    return {
      title: "Ocena jest ograniczona do części możliwych założeń",
      description: `${availableConclusion} Wyniku nie należy traktować jak pełnej oceny FAO-56.`,
      tone: "neutral",
    };
  }

  if (result.assessmentLevel === "weather-context-only") {
    return {
      title: "Dostępne są warunki pogodowe, ale nie pełna ocena wody dla uprawy",
      description:
        "Dostępne dane pogodowe stanowią kontekst. Bez pełnego bilansu nie opisują ilości wody dostępnej dla rośliny.",
      tone: "muted",
    };
  }

  if (result.assessmentLevel === "unavailable") {
    return {
      title: "Nie udało się obliczyć oceny dla tej daty",
      description: "Brak oceny nie oznacza, że na działce występuje niedobór wody.",
      tone: "muted",
    };
  }

  switch (result.balance.classification) {
    case "no-significant-shortage-indications":
      return {
        title: "Model nie wskazuje obecnie ograniczenia poboru wody",
        description:
          "Kompletne scenariusze nie wskazują ograniczenia poboru wody przez uprawę w wybranym dniu. To wynik modelu, a nie pomiar wilgotności gleby.",
        tone: "positive",
      };
    case "elevated-shortage-risk":
      return {
        title: "Model wskazuje ograniczenie dostępności wody dla uprawy",
        description:
          "Model wskazuje, że dostępna woda mogła ograniczać pobór przez uprawę. Wynik nie jest oficjalnym stwierdzeniem suszy ani prognozą straty plonu.",
        tone: "warning",
      };
    case "strong-shortage-indications":
      return {
        title: "Silne modelowane ograniczenie dostępności wody",
        description:
          "Model wskazuje skrajne ograniczenie poboru wody, ale ta klasa wymaga ostrożnej interpretacji i nie zastępuje oceny terenowej.",
        tone: "warning",
      };
    case "indeterminate":
      return {
        title: "Wynik zależy od przyjętych założeń",
        description:
          initialWaterSummary(result) ??
          "Dostępne scenariusze prowadzą do różnych wniosków. Nie ma podstaw, aby wybrać jeden z nich jako rzeczywisty stan działki.",
        tone: "neutral",
      };
    default:
      return {
        title: "Nie możemy wiarygodnie obliczyć oceny dla tej daty",
        description:
          "Nie uzupełniamy braków zerami ani wartościami wymyślonymi. Porównanie z poprzednimi latami może nadal działać niezależnie.",
        tone: "muted",
      };
  }
}

function assessmentLevelLabel(level: WaterAssessmentResponse["assessmentLevel"]): string {
  switch (level) {
    case "full-fao56":
      return "Pełna ocena modelowa";
    case "assumption-dependent":
      return "Ocena zależna od założeń";
    case "limited-fao56":
      return "Ocena ograniczona";
    case "weather-context-only":
      return "Tylko kontekst pogodowy";
    default:
      return "Ocena niedostępna";
  }
}

function toneClasses(tone: ResultPresentation["tone"]): string {
  switch (tone) {
    case "positive":
      return "bg-primary text-primary-foreground";
    case "warning":
      return "bg-warning text-warning-foreground";
    case "neutral":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function ResultIcon({ tone }: { tone: ResultPresentation["tone"] }) {
  if (tone === "positive") return <CheckCircle2 aria-hidden="true" className="size-6" />;
  if (tone === "warning") return <AlertTriangle aria-hidden="true" className="size-6" />;
  if (tone === "neutral") return <HelpCircle aria-hidden="true" className="size-6" />;
  return <CircleDashed aria-hidden="true" className="size-6" />;
}

function formatPeriod(startDate: string, endDate: string): string {
  const formatter = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "UTC" });
  return `${formatter.format(new Date(`${startDate}T00:00:00Z`))}–${formatter.format(
    new Date(`${endDate}T00:00:00Z`),
  )}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatScenarioRange(
  range: { minimum: number; maximum: number } | null,
  unit: string,
): string {
  if (!range) return "brak kompletnych wariantów";
  const formatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
  const minimum = formatter.format(range.minimum);
  const maximum = formatter.format(range.maximum);
  return `${minimum === maximum ? minimum : `${minimum}–${maximum}`}${unit ? ` ${unit}` : ""}`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reliabilityText(result: WaterAssessmentResponse): string {
  if (result.assessmentLevel === "full-fao56") {
    return "Dane pogodowe i model gleby pozwalają obliczyć ocenę. Różne założenia początkowe prowadzą do tego samego wniosku na końcu ocenianego okresu.";
  }
  if (result.assessmentLevel === "assumption-dependent") {
    return "Wynik zależy od założeń, m.in. początkowego zapasu wody w glebie. Sprawdź warunki na polu przed podjęciem decyzji.";
  }
  if (result.assessmentLevel === "limited-fao56") {
    const incompleteFamilies = result.scenarios.families.filter(
      ({ status }) => status !== "complete",
    ).length;
    return `Ukończono ${result.scenarios.completeCount} z ${result.scenarios.totalCount} wariantów. ${incompleteFamilies} ${incompleteFamilies === 1 ? "rodzina założeń pozostaje niekompletna" : "rodziny założeń pozostają niekompletne"}, dlatego dostępny wynik nie reprezentuje wszystkich warunków.`;
  }
  if (result.assessmentLevel === "weather-context-only") {
    return "Dostępna pogoda nie wystarcza do obliczenia stanu wody w strefie korzeniowej. Ta informacja nie jest oceną FAO-56.";
  }
  if (result.scenarios.totalCount === 0) {
    return "Nie uruchomiono scenariuszy uprawowych, ponieważ brakuje wymaganej konfiguracji albo profilu uprawy.";
  }
  return "Brakuje co najmniej jednego wymaganego wejścia. Dostępnych danych nie zamieniono w pozornie pełną ocenę.";
}

function satelliteComparisonText(result: WaterAssessmentResponse): string {
  switch (result.satellite.consistency) {
    case "consistent-with-balance":
      return "Kwalifikowany trend Sentinel-2 jest zgodny z bilansem, ale nie zmienia wyniku FAO-56.";
    case "conflicts-with-balance":
      return "Trend Sentinel-2 jest sprzeczny z bilansem; interpretacja wymaga sprawdzenia fazy uprawy i warunków w polu.";
    case "neutral":
      return "Sentinel-2 nie pokazuje wyraźnego trendu, więc nie wzmacnia ani nie podważa bilansu.";
    case "not-comparable":
      return "Obserwacja satelitarna ma odpowiednią jakość, ale nie można jej porównać z niejednoznacznym bilansem.";
    case "unavailable":
      return "Brak użytecznej obserwacji Sentinel-2; wynik opiera się na bilansie pogody, gleby i uprawy.";
    default:
      return "Zdjęcia satelitarne nie spełniają wymagań porównania z tą oceną: aktualności, jakości, trendu lub fazy rozwoju uprawy.";
  }
}

function weatherGapText(result: WaterAssessmentResponse): string | null {
  if (result.weather.missingDays.length === 0) return null;
  const formatter = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "UTC" });
  const visible = result.weather.missingDays.map(({ date, fields, cause }) => {
    const fieldLabel =
      fields.length === 2
        ? "opadu i ewapotranspiracji referencyjnej ET₀"
        : fields[0] === "precipitation"
          ? "opadu"
          : "ewapotranspiracji referencyjnej ET₀";
    const causeLabel =
      cause === "not-yet-published"
        ? "data po ostatnim dniu zwróconym przez dostawcę"
        : cause === "missing-date"
          ? "brak dnia w szeregu"
          : "brak wartości";
    return `${formatter.format(new Date(`${date}T00:00:00Z`))} (${fieldLabel}; ${causeLabel})`;
  });
  return `Brakuje danych dla ${visible.join(", ")}.`;
}

function weatherAttemptTexts(result: WaterAssessmentResponse): string[] {
  return result.weather.attempts.flatMap((attempt) => {
    if (attempt.outcome !== "failed") return [];
    const provider =
      attempt.providerId === "open-meteo-era5-land"
        ? "Open-Meteo ERA5-Land"
        : attempt.providerId === "open-meteo-era5"
          ? "Open-Meteo ERA5"
          : attempt.providerId === "open-meteo-ecmwf-ifs"
            ? "Open-Meteo ECMWF IFS"
            : attempt.providerId === "nasa-power-daily"
              ? "NASA POWER"
              : attempt.providerRole === "primary"
                ? "Główne źródło pogody"
                : "Zapasowe źródło pogody";
    switch (attempt.errorCode) {
      case "RATE_LIMITED":
        return [
          `${provider} ograniczył liczbę zapytań (HTTP 429). To problem dostępu do usługi, a nie naukowy brak danych pogodowych.`,
        ];
      case "INVALID_RESPONSE":
        return [`${provider} zwrócił odpowiedź, której nie można było poprawnie zmapować.`];
      case "TIMEOUT":
        return [`${provider} nie odpowiedział w wyznaczonym czasie.`];
      default:
        return [`${provider} był chwilowo niedostępny.`];
    }
  });
}

function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= 1) return false;
  return error instanceof ApiClientError && (error.status === null || error.status >= 500);
}

function WaterAssessmentSourceDetails({
  result,
  requestedDateConditions,
}: {
  result: WaterAssessmentResponse;
  requestedDateConditions?: WaterAssessmentResponse["requestedDateConditions"];
}) {
  const seasonStartDates = result.phenology.seasonStartDates ?? [];
  return (
    <div className="source-details">
      <div className="source-sections">
        {requestedDateConditions && (
          <RequestedDateConditionsDetails conditions={requestedDateConditions} />
        )}
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Database aria-hidden="true" className="size-4" />
            Źródła użyte w ocenie
          </h3>
          <ul className="source-records mt-2">
            {result.sources.map((source) => (
              <li key={`${source.kind}-${source.provider}-${source.retrievedAt}`}>
                <span className="block font-medium text-foreground">{source.provider}</span>
                {source.dataset ? ` · ${source.dataset}` : ""}
                {source.dataFrom && source.dataTo
                  ? ` · ${formatPeriod(source.dataFrom, source.dataTo)}`
                  : ""}
                {` · pobrano ${formatTimestamp(source.retrievedAt)}`}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Założenia obliczeń</h3>
          <dl className="source-facts mt-2">
            <div>
              <dt className="text-muted-foreground">Metoda: </dt>
              <dd>dzienny bilans strefy korzeniowej FAO-56.</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Okres pogody: </dt>
              <dd>
                {formatPeriod(result.weather.period.startDate, result.weather.period.endDate)}.
              </dd>
            </div>
            {result.weather.source && (
              <div>
                <dt className="text-muted-foreground">Model pogody: </dt>
                <dd>
                  {result.weather.source.model} · {result.weather.source.spatialResolution}.
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Próby źródeł pogody: </dt>
              <dd>
                {result.weather.attempts
                  .map((attempt) => {
                    const role = attempt.providerRole === "primary" ? "główne" : "zapasowe";
                    const outcome =
                      attempt.outcome === "complete"
                        ? "kompletne"
                        : attempt.outcome === "partial"
                          ? "częściowe"
                          : `błąd${attempt.errorCode ? ` ${attempt.errorCode}` : ""}`;
                    return `${role}: ${outcome}`;
                  })
                  .join(", ") || "brak odpowiedzi"}
                .
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Profil uprawy: </dt>
              <dd>
                {result.crop.profileId
                  ? (CROP_PROFILE_LABELS[result.crop.profileId] ??
                    result.crop.profileLabel ??
                    result.crop.profileId)
                  : "brak zweryfikowanego profilu"}
                .
                {result.crop.profileAssumptions?.map((assumption) => (
                  <p key={assumption}>{assumption}</p>
                ))}
              </dd>
            </div>
            {result.phenology.referenceSource && (
              <div>
                <dt className="font-medium text-foreground">Źródło długości faz:</dt>
                <dd>
                  <a
                    className="underline underline-offset-4"
                    href={result.phenology.referenceSource.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {result.phenology.referenceSource.provider} ·{" "}
                    {result.phenology.referenceSource.dataset}
                  </a>{" "}
                  (wersja {result.phenology.referenceSource.version}, sprawdzono{" "}
                  {result.phenology.referenceSource.accessedOn}). Proporcje faz z INRAE
                  przeskalowano do 317–335 dni sezonu na podstawie{" "}
                  <a
                    className="underline underline-offset-4"
                    href={result.phenology.referenceSource.supportingSourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    badań w północno-wschodniej Polsce
                  </a>
                  . To założenie modelu, nie kalibracja dat poszczególnych faz ani obserwacja
                  działki.
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Założony początek sezonu: </dt>
              <dd>
                {seasonStartDates.length > 0
                  ? seasonStartDates.map(formatDate).join(", ")
                  : "nie można wyznaczyć dla tej uprawy"}
                .
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pochodzenie założenia: </dt>
              <dd>
                {result.phenology.basis === "project-standard"
                  ? "referencyjny termin modelu przyjęty automatycznie; nie jest to potwierdzona data siewu na działce"
                  : "konfiguracja przekazana w żądaniu analizy"}
                .
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Scenariusze: </dt>
              <dd>
                {result.scenarios.totalCount}; obejmują niepewność początkowego zapasu wody,
                pojemności polowej, głębokości korzeni i pory opadu.
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ukończone warianty: </dt>
              <dd>
                {result.scenarios.completeCount} z {result.scenarios.totalCount}.
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ks na końcu ocenianego okresu: </dt>
              <dd>
                {formatScenarioRange(result.scenarios.finalWaterStressCoefficient, "")}. Wartość 1
                oznacza brak modelowanego ograniczenia poboru; niższa wartość oznacza ograniczenie.
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dni ograniczenia w sezonie: </dt>
              <dd>{formatScenarioRange(result.scenarios.stressDays, "dni")}.</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Deficyt ET w sezonie: </dt>
              <dd>
                {formatScenarioRange(result.scenarios.cumulativeEvapotranspirationDeficitMm, "mm")}.
                Jest to wynik modelu, a nie dawka nawadniania.
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Interpretacja zakresów: </dt>
              <dd>
                Zakresy obejmują wyłącznie ukończone warianty. Pokazują wpływ założeń i nie są
                przedziałami ufności.
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Początkowa głębokość korzeni: </dt>
              <dd>
                Dla roślin jednorocznych początkowo 0,2 m; dla istniejących upraw wieloletnich
                zachowana jest głębokość korzeni profilu FAO-56.
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {result.limitations.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Pełna lista ograniczeń</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
            {result.limitations.map((limitation) => (
              <li key={limitation}>{LIMITATION_LABELS[limitation]}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type WaterSituationSummaryProps = {
  analysisDate: string;
  crop: Crop;
  parcelIdentifier: string;
  onAnalysisDateChange?: (date: string) => void;
  seasonStartDate?: string;
};

export function WaterSituationSummary({
  analysisDate,
  crop,
  parcelIdentifier,
  onAnalysisDateChange,
  seasonStartDate,
}: WaterSituationSummaryProps) {
  const print = useReportPrint();
  const request = createWaterAssessmentRequest({
    analysisDate,
    crop,
    parcelIdentifier,
    seasonStartDate,
  });
  const assessmentQuery = useQuery({
    queryKey: ["water-assessment", parcelIdentifier, crop, analysisDate, seasonStartDate],
    queryFn: ({ signal }) => getWaterAssessment(request, signal),
    retry: shouldRetry,
    staleTime: 30 * 60 * 1_000,
    gcTime: 60 * 60 * 1_000,
    refetchOnWindowFocus: false,
  });

  if (assessmentQuery.isPending) {
    return (
      <section
        aria-live="polite"
        aria-busy="true"
        aria-labelledby="water-situation-title"
        className="rounded-2xl bg-card p-5 shadow-[0_14px_38px_rgba(15,37,25,0.10)] sm:p-6"
      >
        <ReportSectionHeader
          headingLevel="h1"
          icon={Droplets}
          id="water-situation-title"
          title="Sytuacja wodna Twojej działki"
        />
        <div className="mt-5" role="status">
          <div className="h-28 animate-pulse rounded-xl bg-secondary" />
          <div className="mt-5 h-4 w-52 max-w-full animate-pulse rounded bg-secondary" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-secondary" />
          <span className="sr-only">Trwa obliczanie sytuacji wodnej.</span>
        </div>
      </section>
    );
  }

  if (assessmentQuery.isError) {
    return (
      <section
        aria-live="polite"
        aria-labelledby="water-situation-title"
        className="rounded-2xl bg-card p-5 shadow-[0_14px_38px_rgba(15,37,25,0.10)] sm:p-6"
      >
        <ReportSectionHeader
          headingLevel="h1"
          icon={Droplets}
          id="water-situation-title"
          title="Sytuacja wodna Twojej działki"
        />
        <div className="mt-5 rounded-xl bg-destructive/10 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h2 className="font-semibold">Nie udało się wykonać analizy</h2>
              <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
                Analiza nie zwróciła poprawnego wyniku. Przyczyną może być chwilowa niedostępność
                API lub jednego ze źródeł danych. Pozostałe części raportu nadal działają
                niezależnie.
              </p>
              <RetryButton
                className="mt-3"
                isRetrying={assessmentQuery.isFetching}
                onRetry={() => void assessmentQuery.refetch()}
              >
                Spróbuj ponownie
              </RetryButton>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const requestedResult = assessmentQuery.data;
  const result = requestedResult.completedSeason ?? requestedResult;
  const presentation = getResultPresentation(result);
  const gapText = weatherGapText(result);
  const reasonLabels = result.reasonCodes
    .filter((reason) => reason !== "SATELLITE_UNAVAILABLE")
    .map((reason) => {
      if (
        reason === "WEATHER_SERIES_INCOMPLETE" &&
        result.weather.et0AvailableDayCount < result.weather.period.expectedDayCount
      ) {
        return "Brakuje danych o parowaniu potrzebnych do obliczenia bilansu wody.";
      }
      return result.evaluation?.scope === "completed-season"
        ? REASON_LABELS[reason].replace("w dniu analizy", "na końcu ocenianego okresu")
        : REASON_LABELS[reason];
    })
    .slice(0, 3);
  const transientFailure = result.weather.attempts.some(
    (attempt) =>
      attempt.outcome === "failed" &&
      ["RATE_LIMITED", "TIMEOUT", "PROVIDER_UNAVAILABLE", "REQUEST_FAILED"].includes(
        attempt.errorCode ?? "",
      ),
  );
  const alternativeDate = result.weather.latestCompleteAssessmentDate ?? null;
  const canUseAlternativeDate =
    alternativeDate !== null &&
    alternativeDate < analysisDate &&
    result.weather.purpose === "fao56-season" &&
    result.phenology.activeScenarioCount > 0 &&
    result.soil.usableWaterLayerCount > 0 &&
    onAnalysisDateChange !== undefined;

  return (
    <section
      aria-live="polite"
      aria-labelledby="water-situation-title"
      className="rounded-2xl bg-card p-5 shadow-[0_14px_38px_rgba(15,37,25,0.10)] sm:p-6"
    >
      <ReportSectionHeader
        headingLevel="h1"
        icon={Droplets}
        id="water-situation-title"
        source={{
          content: (
            <WaterAssessmentSourceDetails
              result={result}
              requestedDateConditions={requestedResult.requestedDateConditions}
            />
          ),
          description:
            "Metoda obliczeń, pochodzenie danych i ograniczenia bieżącej oceny sytuacji wodnej.",
          title: "Źródła i metoda oceny wodnej",
        }}
        title="Sytuacja wodna Twojej działki"
      />
      <CropModelNotice kind={result.crop.modelKind} />

      {requestedResult.requestedDateConditions &&
        (result.evaluation?.scope === "completed-season" ||
          requestedResult.requestedDateConditions.ongoingDay ||
          requestedResult.requestedDateConditions.cropAssessment !== "fao56") && (
          <RequestedDateConditions conditions={requestedResult.requestedDateConditions} />
        )}

      <p className="mt-4 text-sm text-muted-foreground">
        {result.evaluation?.scope === "completed-season"
          ? "Osobny bilans zakończonej uprawy:"
          : "Oceniany okres:"}{" "}
        {formatPeriod(result.weather.period.startDate, result.weather.period.endDate)}
      </p>

      {result.phenology.referenceSource?.adaptation && (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Kalendarz rzepaku jest orientacyjnym założeniem modelu. Faktyczne fazy rozwoju na tej
          działce nie zostały potwierdzone.
        </p>
      )}

      <div className={`mt-4 rounded-xl p-4 sm:p-5 ${toneClasses(presentation.tone)}`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            <ResultIcon tone={presentation.tone} />
          </span>
          <div className="min-w-0">
            <Badge
              className={presentation.tone === "positive" ? "mb-2 bg-background/95" : "mb-2"}
              variant={
                result.assessmentLevel === "full-fao56"
                  ? "success"
                  : result.assessmentLevel === "assumption-dependent" ||
                      result.assessmentLevel === "limited-fao56" ||
                      result.assessmentLevel === "weather-context-only"
                    ? "warning"
                    : "neutral"
              }
            >
              {assessmentLevelLabel(result.assessmentLevel)}
            </Badge>
            <h2 className="text-balance text-lg font-semibold tracking-[-0.015em]">
              {presentation.title}
            </h2>
            <p className="mt-2 max-w-[70ch] text-sm leading-6 opacity-90">
              {presentation.description}
            </p>
            {presentation.note && (
              <p className="mt-2 max-w-[70ch] text-sm leading-6 opacity-90">{presentation.note}</p>
            )}
          </div>
        </div>
        {print?.variant !== "simple" && result.assessmentLevel === "assumption-dependent" && (
          <WaterScenarioComparison result={result} />
        )}
      </div>

      {((transientFailure && result.weather.status !== "complete") ||
        requestedResult.requestedDateConditions?.status === "unavailable" ||
        result.soil.status === "unavailable") && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            {requestedResult.requestedDateConditions?.status === "unavailable"
              ? "Brakuje pogody dla żądanego dnia. Ponowienie nie zmieni daty analizy."
              : result.soil.status === "unavailable"
                ? "Źródło danych glebowych jest chwilowo niedostępne. Spróbuj ponownie."
                : "Źródło danych pogodowych jest chwilowo niedostępne lub przeciążone. Spróbuj ponownie."}
          </p>
          <RetryButton
            className="mt-2"
            isRetrying={assessmentQuery.isFetching}
            onRetry={() => void assessmentQuery.refetch()}
          >
            Ponów analizę
          </RetryButton>
        </div>
      )}

      {canUseAlternativeDate && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => onAnalysisDateChange(alternativeDate)}
            size="sm"
            type="button"
            variant="outline"
          >
            Sprawdź ostatni dzień z kompletnymi danymi
          </Button>
          <span className="text-xs text-muted-foreground">
            Nowa data: {formatDate(alternativeDate)}
          </span>
        </div>
      )}

      <div className="mt-4 text-sm leading-6 text-muted-foreground">
        <p>{reliabilityText(result)}</p>
        {result.balance.classification !== "insufficient-data" && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <strong className="text-foreground">Satelita: </strong>
            {satelliteComparisonText(result)}
          </p>
        )}
      </div>

      {print?.variant === "simple" && (
        <div className="mt-3 text-sm">
          <ul>
            {reasonLabels.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {gapText && <p>{gapText}</p>}
          {weatherAttemptTexts(result).map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      )}
      <details
        className={`mt-6 border-t border-border pt-4 ${print ? "print-assessment-method" : ""}`}
      >
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Jak powstała ocena?
        </summary>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h2 className="text-base font-semibold">Dlaczego otrzymaliśmy ten wynik?</h2>
            {reasonLabels.length > 0 ? (
              <ul className="mt-3 space-y-2.5 text-sm leading-6">
                {reasonLabels.map((reason) => (
                  <li className="flex items-start gap-2.5" key={reason}>
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Brak dodatkowych informacji o przyczynach tego wyniku.
              </p>
            )}
          </div>

          <div>
            <h2 className="text-base font-semibold">Wiarygodność oceny</h2>

            {result.scenarios.initialConditionConvergence.evaluatedPairs >
              result.scenarios.initialConditionConvergence.pairsWithSameStressConclusion && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Sam wybór mokrego lub skrajnie suchego początku zmienia wniosek w{" "}
                {result.scenarios.initialConditionConvergence.evaluatedPairs -
                  result.scenarios.initialConditionConvergence.pairsWithSameStressConclusion}{" "}
                z {result.scenarios.initialConditionConvergence.evaluatedPairs} porównań par
                wariantów. Nie znamy rzeczywistego początkowego zapasu wody w glebie.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          {gapText && <p className="mb-2 text-sm text-muted-foreground">{gapText}</p>}
          {weatherAttemptTexts(result).map((text) => (
            <p className="mb-2 text-sm text-muted-foreground" key={text}>
              {text}
            </p>
          ))}
          {!print && <WaterAssessmentSourceDetails result={result} />}
        </div>
      </details>
    </section>
  );
}
