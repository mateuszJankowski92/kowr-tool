import type { WaterAssessmentResponse } from "@kowr/contracts";
import { ChevronDown, Info } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { compareWaterScenarios, type WaterScenarioVariant } from "./water-scenario-comparison";

function variantOutcome(variant: WaterScenarioVariant): string {
  const range = variant.stressDays;
  if (!range) return "Brak ukończonych obliczeń dla tego założenia.";
  const days =
    range.minimum === range.maximum ? String(range.minimum) : `${range.minimum}–${range.maximum}`;
  const { withStress, withoutStress, unavailable } = variant.finalDay;
  const ending =
    withStress > 0 && withoutStress > 0
      ? `Na końcu okresu: ograniczenie w ${withStress} z ${withStress + withoutStress} obliczonych wariantów, brak ograniczenia w ${withoutStress}.`
      : withStress > 0
        ? "Na końcu okresu: ograniczenie we wszystkich obliczonych wariantach."
        : withoutStress > 0
          ? "Na końcu okresu: brak ograniczenia we wszystkich obliczonych wariantach."
          : "Brak wyniku dla końca okresu.";
  const missing = unavailable > 0 ? ` Nieukończone lub bez wyniku końcowego: ${unavailable}.` : "";
  return `${days} ${range.minimum === 1 && range.maximum === 1 ? "dzień" : "dni"} ograniczenia poboru wody w okresie. ${ending}${missing}`;
}

function formatDays(variant: WaterScenarioVariant): string {
  if (!variant.stressDays) return "Brak wyniku";
  const { minimum, maximum } = variant.stressDays;
  return `${minimum === maximum ? minimum : `${minimum}–${maximum}`} ${minimum === 1 && maximum === 1 ? "dzień" : "dni"}`;
}

function ScenarioRange({ variant, maximum }: { variant: WaterScenarioVariant; maximum: number }) {
  const range = variant.stressDays;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4 text-sm">
        <span className="min-w-0 font-medium">{variant.shortLabel}</span>
        <strong className="shrink-0 font-semibold tabular-nums">{formatDays(variant)}</strong>
      </div>
      {range ? (
        <svg
          aria-hidden="true"
          className="mt-1 block h-7 w-full overflow-visible text-primary"
          preserveAspectRatio="none"
          viewBox="0 0 100 28"
        >
          <line
            x1="0"
            x2="100"
            y1="14"
            y2="14"
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={(range.minimum / maximum) * 100}
            x2={(range.maximum / maximum) * 100}
            y1="14"
            y2="14"
            stroke="currentColor"
            strokeOpacity="0.75"
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {[range.minimum, range.maximum].map((value, index) => (
            <line
              key={index === 0 ? "minimum" : "maximum"}
              x1={(value / maximum) * 100}
              x2={(value / maximum) * 100}
              y1="8"
              y2="20"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Brakuje ukończonych obliczeń. Brak danych nie oznacza zera dni.
        </p>
      )}
      {variant.completeCount < variant.totalCount && (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Obliczono {variant.completeCount} z {variant.totalCount} wariantów. Zakres obejmuje tylko
          ukończone.
        </p>
      )}
    </li>
  );
}

export function WaterScenarioComparison({ result }: { result: WaterAssessmentResponse }) {
  const comparisons = compareWaterScenarios(result);
  const primary = comparisons.filter(({ technical }) => !technical);
  const visible = primary.length > 0 ? primary : comparisons;
  if (visible.length === 0) {
    return (
      <p className="mt-3 text-sm leading-6">
        Brak szczegółowych wyników pozwalających porównać założenia.
      </p>
    );
  }
  // All comparisons share a scale so their ranges can be compared directly.
  const maximum = Math.max(
    1,
    result.weather.period.expectedDayCount,
    ...comparisons.flatMap(({ variants }) =>
      variants.flatMap(({ stressDays }) => (stressDays ? [stressDays.maximum] : [])),
    ),
  );
  const renderComparison = (comparison: (typeof comparisons)[number]) => (
    <div className="space-y-2" key={comparison.id}>
      <h4 className="font-semibold">{comparison.label}</h4>
      <p className="flex items-start gap-2">
        <Info aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
        <span>{comparison.explanation}</span>
      </p>
      <ul className="space-y-2 text-muted-foreground">
        {comparison.variants.map((variant) => (
          <li key={variant.label}>
            <strong className="font-medium text-foreground">{variant.label}: </strong>
            {variantOutcome(variant)}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section
      className="mt-5 border-t border-primary/15 pt-5 text-sm leading-6"
      aria-label="Wyniki zależnie od założeń"
    >
      <h3 className="font-semibold">Jak założenia zmieniają wynik?</h3>
      <p className="mt-1 text-muted-foreground">
        Porównaj liczbę dni, w których model wskazuje ograniczony pobór wody przez uprawę.
      </p>
      <div className="mt-2 divide-y divide-primary/15">
        {visible.map((comparison) => (
          <figure
            aria-label={comparison.label}
            className="grid gap-5 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8"
            key={comparison.id}
          >
            <figcaption>
              <h4 className="font-semibold">{comparison.label}</h4>
              <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>{comparison.explanation}</span>
              </p>
            </figcaption>
            <div className="min-w-0">
              <ul>
                {comparison.variants.map((variant) => (
                  <ScenarioRange key={variant.label} maximum={maximum} variant={variant} />
                ))}
              </ul>
              <div
                aria-hidden="true"
                className="mt-2 flex justify-between border-t border-primary/15 pt-2 text-xs tabular-nums text-muted-foreground"
              >
                <span>0</span>
                {maximum > 1 && <span>{Math.round(maximum / 2)}</span>}
                <span>{maximum} dni</span>
              </div>
            </div>
          </figure>
        ))}
      </div>
      <Alert className="mt-3">
        <Info aria-hidden="true" />
        <AlertDescription>
          Odcinek pokazuje minimum i maksimum wyników modelu. W każdej grupie zmieniają się także
          inne założenia. To nie jest przedział ufności ani pomiar wilgotności.
        </AlertDescription>
      </Alert>
      <details className="group mt-4 border-t border-primary/15 pt-2">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Pełne wyniki i założenia
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-3 space-y-5 pb-2">
          <p className="text-muted-foreground">
            Każdy zakres obejmuje warianty z danym założeniem; pozostałe założenia także się w nich
            zmieniają. Scenariusze nie mają przypisanych prawdopodobieństw.
          </p>
          {comparisons.map(renderComparison)}
        </div>
      </details>
    </section>
  );
}
