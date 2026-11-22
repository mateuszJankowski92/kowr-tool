import type { WaterAssessmentResponse } from "@kowr/contracts";

type Props = { conditions: NonNullable<WaterAssessmentResponse["requestedDateConditions"]> };

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function millimeters(value: number | null): string {
  return value === null
    ? "Brak pełnych danych"
    : `${new Intl.NumberFormat("pl-PL", {
        maximumFractionDigits: 1,
      }).format(value)} mm`;
}

export function RequestedDateConditions({ conditions }: Props) {
  return (
    <div className="mt-5 border-y border-border py-5">
      <h2 className="text-lg font-semibold">Warunki na {dateLabel(conditions.date)}</h2>
      {conditions.ongoingDay && (
        <p className="mt-2 text-sm leading-6" role="status">
          Doba jeszcze trwa. Pełne sumy dobowe nie są dostępne.
        </p>
      )}
      {conditions.cropAssessment === "outside-modelled-season" && (
        <p className="mt-2 max-w-[72ch] text-sm leading-6 text-muted-foreground">
          Poza modelowanym sezonem pokazujemy pogodę, bez oceny obecnego stresu uprawy.
        </p>
      )}
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Opad</dt>
          <dd className="mt-1 font-semibold">{millimeters(conditions.day.precipitationMm)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Parowanie referencyjne ET₀</dt>
          <dd className="mt-1 font-semibold">
            {millimeters(conditions.day.referenceEvapotranspirationMm)}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-6">
        {conditions.signal === "incomplete"
          ? "Braki danych uniemożliwiają porównanie opadu z parowaniem za ostatnie 30 dni."
          : conditions.signal === "precipitation-below-reference-et0"
            ? `Ostatnie 30 dni: opad był mniejszy od referencyjnego parowania o ${millimeters(Math.abs(conditions.differenceMm ?? 0))}.`
            : `Ostatnie 30 dni: opad pokrywał referencyjne parowanie; różnica wynosi ${millimeters(conditions.differenceMm)}.`}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        To porównanie pogody, bez pomiaru wilgotności gleby i diagnozy suszy.
      </p>
      {!conditions.source && (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Źródło danych dla żądanego dnia jest niedostępne. Możesz ponowić analizę.
        </p>
      )}
    </div>
  );
}

export function RequestedDateConditionsDetails({ conditions }: Props) {
  return (
    <section>
      <h3 className="font-semibold text-foreground">Warunki na {dateLabel(conditions.date)}</h3>
      {conditions.cropAssessment === "outside-modelled-season" && (
        <p className="mt-2">
          Wybrana uprawa jest poza modelowanym sezonem. Bez informacji o aktualnej okrywie i
          wilgotności gleby nie określamy obecnego stresu roślin. Bilans zakończonej uprawy jest
          prezentowany osobno.
        </p>
      )}
      {conditions.ongoingDay && (
        <p className="mt-2">
          Doba jeszcze trwa. Nie traktujemy prognozy ani części doby jako kompletnej obserwacji.
        </p>
      )}
      <dl className="source-facts mt-3">
        <div>
          <dt>Okres porównania: </dt>
          <dd>
            {dateLabel(conditions.period.startDate)}–{dateLabel(conditions.period.endDate)}.
          </dd>
        </div>
        <div>
          <dt>Opady: </dt>
          <dd>
            {millimeters(conditions.precipitationMm)} ({conditions.precipitationDayCount}/
            {conditions.period.expectedDayCount} dni).
          </dd>
        </div>
        <div>
          <dt>Parowanie referencyjne ET₀: </dt>
          <dd>
            {millimeters(conditions.referenceEvapotranspirationMm)} ({conditions.et0DayCount}/
            {conditions.period.expectedDayCount} dni).
          </dd>
        </div>
      </dl>
      <p className="mt-2">
        P − ET₀ opisuje warunki atmosferyczne, a nie zapas wody w glebie ani diagnozę suszy.
        Brakujących danych nie uzupełniamy zerami.
      </p>
      <p className="mt-3 break-words">
        {conditions.source
          ? `${conditions.source.provider} · ${conditions.source.model} · ${conditions.source.spatialResolution} · ${conditions.source.timeStandard}. Pobrano ${new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(conditions.source.retrievedAt))}.`
          : "Źródło danych dla żądanego dnia jest niedostępne. Możesz ponowić analizę."}
      </p>
    </section>
  );
}
