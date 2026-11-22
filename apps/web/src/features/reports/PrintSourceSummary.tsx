import type {
  HistoricalWaterAssessmentResponse,
  ParcelResponse,
  SoilProfileResponse,
  TerrainContextResponse,
  WaterAssessmentResponse,
  WeatherConditionsResponse,
} from "@kowr/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { PrintReportSelection } from "./print-report-data";

function formatSourceTerms(value: string): string {
  const translations: Record<string, string> = {
    "Free use under the Polish Geodetic and Cartographic Law":
      "Bezpłatne wykorzystanie na podstawie Prawa geodezyjnego i kartograficznego",
    "NASA open data; attribution requested": "Otwarte dane NASA; prosimy o podanie źródła",
  };
  return translations[value] ?? value;
}

export function PrintSourceSummary({
  parcel,
  selection,
}: {
  parcel: ParcelResponse;
  selection: PrintReportSelection;
}) {
  const client = useQueryClient();
  const { crop, dateSelection, weatherPreset } = selection;
  const date = dateSelection.type === "day" ? dateSelection.date : dateSelection.endDate;
  const requested = client.getQueryData<WaterAssessmentResponse>([
    "water-assessment",
    parcel.identifier,
    crop,
    date,
    undefined,
  ]);
  const result = requested?.completedSeason ?? requested;
  const soil = client.getQueryData<SoilProfileResponse>(["soil-profile", parcel.identifier]);
  const terrain = client.getQueryData<TerrainContextResponse>([
    "terrain-context",
    parcel.identifier,
  ]);
  const weather = client.getQueryData<WeatherConditionsResponse>([
    "weather-conditions",
    parcel.identifier,
    crop,
    dateSelection,
    weatherPreset,
  ]);
  const history = client.getQueryData<HistoricalWaterAssessmentResponse>([
    "historical-water-assessment",
    parcel.identifier,
    crop,
    date,
    undefined,
  ]);
  const spatial = terrain
    ? [terrain.terrain, terrain.surroundings.hydrology, terrain.surroundings.landUse]
    : [];
  const sources = [
    {
      provider: parcel.provenance.provider,
      dataset: parcel.provenance.datasource,
      retrievedAt: parcel.provenance.retrievedAt,
      dates: "Aktualna granica działki",
    },
    ...(result?.sources
      .filter((source) => source.kind !== "parcel")
      .map((source) => ({
        ...source,
        dates:
          source.dataFrom && source.dataTo
            ? `${source.dataFrom} – ${source.dataTo}`
            : "Brak daty obserwacji w źródle",
      })) ?? []),
    ...(soil ? [{ ...soil.provenance, dates: "Statyczny model gleby; brak daty obserwacji" }] : []),
    ...(weather
      ? [
          {
            ...weather.source,
            dates: `${weather.period.startDate} – ${weather.period.endDate}`,
          },
        ]
      : []),
    ...(history?.seasons.flatMap((season) =>
      season.weather.source
        ? [
            {
              ...season.weather.source,
              dates: `${season.periodStartDate} – ${season.periodEndDate}`,
            },
          ]
        : [],
    ) ?? []),
    ...spatial.flatMap((part) =>
      part.status === "available"
        ? [
            {
              ...part.source,
              dates:
                "snapshotAt" in part.source
                  ? part.source.snapshotAt
                  : (part.source.sourceDataDate ?? "Brak daty obserwacji w źródle"),
            },
          ]
        : [],
    ),
  ];
  const groups = new Map<string, typeof sources>();
  for (const source of sources) {
    const model = "model" in source ? source.model : "";
    const key = `${source.provider}:${source.dataset}:${model}`;
    const group = groups.get(key) ?? [];
    group.push(source);
    groups.set(key, group);
  }
  return (
    <section className="print-source-summary">
      <h2>Źródła i ograniczenia</h2>
      <ul>
        {[...groups].map(([key, group]) => {
          const source = group[0];
          if (!source) return null;
          const dates = [...new Set(group.map((entry) => entry.dates))].sort();
          const retrieved = [...new Set(group.map((entry) => entry.retrievedAt))].sort();
          return (
            <li key={key}>
              <strong>
                {source.provider}
                {source.dataset ? ` · ${source.dataset}` : ""}
              </strong>
              {"model" in source ? ` · ${source.model}` : ""}
              {" · "}
              {dates.length > 1
                ? `${dates.length} odrębnych okresów danych źródłowych: ${dates[0]} … ${dates.at(-1)}`
                : dates[0]}
              {" · pobrano "}
              {retrieved[0]}
              {retrieved.length > 1 ? ` … ${retrieved.at(-1)}` : ""}
              {"license" in source ? ` · ${formatSourceTerms(source.license)}` : ""}
              {"usageTerms" in source ? ` · ${formatSourceTerms(source.usageTerms)}` : ""}
            </li>
          );
        })}
      </ul>
      {result && (
        <p>
          Model uprawy: {result.crop.profileLabel ?? result.crop.profileId ?? "brak danych"}.
          Referencyjne daty początku sezonu:{" "}
          {result.phenology.seasonStartDates?.join(", ") || "brak danych"}.
          {result.phenology.referenceSource
            ? ` Kalendarz: ${result.phenology.referenceSource.provider} · ${result.phenology.referenceSource.dataset}.`
            : ""}
          {result.crop.profileAssumptions?.join(" ")}
        </p>
      )}
      <p>
        FAO-56 to model, a nie pomiar terenowy. Kalendarz uprawy i początkowy zapas wody w glebie są
        założeniami. Zakresy scenariuszy nie są prawdopodobieństwami ani przedziałami ufności. Nie
        znamy nawadniania, spływu ani podsiąku kapilarnego. Do porównań historycznych wykorzystujemy
        aktualną granicę działki i model gleby; rzeczywiste uprawy w poprzednich latach nie zostały
        potwierdzone.
      </p>
      <p>
        SoilGrids: model o rozdzielczości 250 m, CC BY 4.0. Obiekty wodne i użytkowanie terenu: ©
        autorzy OpenStreetMap, ODbL. Także dla dat historycznych wykorzystujemy bieżący stan mapy.
        Brak obiektu na mapie nie potwierdza jego braku w terenie. Zalecenia wymagają weryfikacji
        terenowej, a w odpowiednich przypadkach także formalnoprawnej. Nie gwarantują wzrostu plonu
        ani oszczędności wody.
      </p>
      {!soil && <p>Źródło danych glebowych jest niedostępne.</p>}
      {soil && soil.status !== "complete" && (
        <p>Profil gleby jest niepełny; brakujące właściwości pozostają niedostępne.</p>
      )}
      {!terrain && <p>Źródła danych o terenie, wodzie i użytkowaniu powierzchni są niedostępne.</p>}
      {terrain &&
        [
          { label: "Model wysokościowy", part: terrain.terrain },
          { label: "Obiekty wodne", part: terrain.surroundings.hydrology },
          { label: "Użytkowanie terenu", part: terrain.surroundings.landUse },
        ].map(({ label, part }) =>
          part.status === "unavailable" ? (
            <p key={label}>
              {label}:{" "}
              {part.reason === "no-data"
                ? "brak użytecznych danych dla tej działki."
                : "źródło danych jest chwilowo niedostępne."}
            </p>
          ) : null,
        )}
      {!weather && <p>Porównanie warunków pogodowych jest niedostępne.</p>}
      {!history && <p>Porównanie historyczne jest niedostępne.</p>}
      {!requested && <p>Ocena sytuacji wodnej jest niedostępna.</p>}
    </section>
  );
}
