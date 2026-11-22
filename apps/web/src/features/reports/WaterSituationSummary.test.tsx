import type { WaterAssessmentResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWaterAssessment } from "../../api/analyses";
import { ApiClientError } from "../../api/request-json";
import { DataSourceDrawerProvider } from "./DataSourceDrawer";
import { WaterSituationSummary } from "./WaterSituationSummary";
import { completeWaterAssessment } from "./water-assessment.test-fixture";
import {
  assumptionDependentAssessment,
  waterScenario,
} from "./water-scenario-comparison.test-fixture";

vi.mock("../../api/analyses", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/analyses")>();
  return { ...original, getWaterAssessment: vi.fn() };
});

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DataSourceDrawerProvider>{node}</DataSourceDrawerProvider>
    </QueryClientProvider>,
  );
}

function renderSummary() {
  return renderWithQueryClient(
    <WaterSituationSummary
      analysisDate="2025-06-30"
      crop="pszenica-zwyczajna-jara"
      parcelIdentifier="141201_1.0001.6509"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WaterSituationSummary", () => {
  it("shows a loading state without blocking the rest of the report", () => {
    vi.mocked(getWaterAssessment).mockReturnValue(new Promise(() => {}));

    renderSummary();

    expect(screen.getByText("Trwa obliczanie sytuacji wodnej.")).not.toBeNull();
  });

  it("presents a complete result in plain Polish with evidence and provenance", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue(completeWaterAssessment);

    renderSummary();

    expect(
      await screen.findByRole("heading", {
        name: "Model nie wskazuje obecnie ograniczenia poboru wody",
      }),
    ).not.toBeNull();
    expect(
      screen.getByText(/Żaden kompletny scenariusz nie wskazuje ograniczenia poboru wody/),
    ).not.toBeNull();
    expect(screen.queryByText("32/32")).toBeNull();
    expect(screen.queryByText("6/6 warstw")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Sytuacja wodna Twojej działki",
      }),
    );
    const sourceDrawer = screen.getByRole("dialog");
    expect(
      within(sourceDrawer).getByText(/dzienny bilans strefy korzeniowej FAO-56/),
    ).not.toBeNull();
    expect(within(sourceDrawer).getByText(/NASA POWER/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/SoilGrids250m 2.0/)).not.toBeNull();
  });

  it("keeps contradictory scenarios explicitly indeterminate", async () => {
    const result: WaterAssessmentResponse = {
      ...completeWaterAssessment,
      status: "indeterminate",
      assessmentLevel: "assumption-dependent",
      balance: {
        classification: "indeterminate",
        scenarioConsensus: "scenario-disagreement",
        reason: "core-scenarios-disagree",
      },
      reasonCodes: ["SCENARIO_CONCLUSIONS_DISAGREE"],
    };
    vi.mocked(getWaterAssessment).mockResolvedValue(result);

    renderSummary();

    expect(
      await screen.findByRole("heading", { name: "Wynik zależy od przyjętych założeń" }),
    ).not.toBeNull();
    expect(screen.getAllByText(/scenariusze prowadzą do różnych wniosków/i)).toHaveLength(2);
    expect(screen.getByText("Ocena zależna od założeń").getAttribute("data-variant")).toBe(
      "warning",
    );
  });

  it("shows partial source completeness as insufficient evidence, not a technical error", async () => {
    const result: WaterAssessmentResponse = {
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      dataAvailability: "partial",
      availableScenarioConclusion: null,
      balance: {
        classification: "insufficient-data",
        scenarioConsensus: null,
        reason: null,
      },
      weather: {
        ...completeWaterAssessment.weather,
        status: "partial",
        et0AvailableDayCount: 99,
        completeDayCount: 99,
        missingDays: [{ date: "2025-06-30", fields: ["et0"], cause: "missing-variable" }],
        latestContiguousCompleteDate: "2025-06-29",
        latestCompleteAssessmentDate: "2025-06-29",
      },
      reasonCodes: ["WEATHER_SERIES_INCOMPLETE", "REQUIRED_SCENARIO_INCOMPLETE"],
    };
    vi.mocked(getWaterAssessment).mockResolvedValue(result);

    renderSummary();

    expect(
      await screen.findByRole("heading", {
        name: "Dostępne są warunki pogodowe, ale nie pełna ocena wody dla uprawy",
      }),
    ).not.toBeNull();
    expect(
      screen.getByText(/30 czerwca 2025.*ewapotranspiracji referencyjnej ET₀/i),
    ).not.toBeNull();
    expect(screen.queryByText("Nie udało się wykonać analizy")).toBeNull();
  });

  it("presents complete scenarios as a limited assessment when another family is unavailable", async () => {
    const result: WaterAssessmentResponse = {
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "limited-fao56",
      dataAvailability: "partial",
      availableScenarioConclusion: "consistent-no-stress",
      reasonCodes: ["SOIL_PROFILE_INCOMPLETE", "REQUIRED_SCENARIO_INCOMPLETE"],
      scenarios: {
        ...completeWaterAssessment.scenarios,
        completeCount: 16,
        families: [
          {
            phenologyScenarioId: "reference-1",
            fieldCapacity: "10-kpa",
            status: "complete",
            completeCount: 16,
            totalCount: 16,
            canChangeConclusion: false,
          },
          {
            phenologyScenarioId: "reference-1",
            fieldCapacity: "33-kpa",
            status: "unavailable",
            completeCount: 0,
            totalCount: 16,
            canChangeConclusion: true,
          },
        ],
      },
    };
    vi.mocked(getWaterAssessment).mockResolvedValue(result);

    renderSummary();

    expect(
      await screen.findByRole("heading", {
        name: "Ocena jest ograniczona do części możliwych założeń",
      }),
    ).not.toBeNull();
    expect(screen.getByText(/brakujące warianty mogłyby zmienić ten wniosek/i)).not.toBeNull();
    expect(screen.getByText(/1 rodzina założeń pozostaje niekompletna/i)).not.toBeNull();
  });

  it("distinguishes provider rate limiting from scientific data absence", async () => {
    const result: WaterAssessmentResponse = {
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "unavailable",
      dataAvailability: "unavailable",
      availableScenarioConclusion: null,
      weather: {
        ...completeWaterAssessment.weather,
        status: "unavailable",
        completeDayCount: 0,
        precipitationAvailableDayCount: 0,
        et0AvailableDayCount: 0,
        source: null,
        latestContiguousCompleteDate: null,
        attempts: [
          {
            providerRole: "primary",
            providerId: "open-meteo-era5-land",
            outcome: "failed",
            errorCode: "RATE_LIMITED",
          },
          {
            providerRole: "fallback",
            providerId: "nasa-power-daily",
            outcome: "failed",
            errorCode: "TIMEOUT",
          },
        ],
      },
      reasonCodes: ["WEATHER_UNAVAILABLE"],
    };
    vi.mocked(getWaterAssessment).mockResolvedValue(result);

    renderSummary();

    expect(await screen.findByText(/ograniczył liczbę zapytań \(HTTP 429\)/i)).not.toBeNull();
    expect(screen.getByText(/nie naukowy brak danych pogodowych/i)).not.toBeNull();
    expect(
      screen.getByText(/Źródło danych pogodowych jest chwilowo niedostępne lub przeciążone/i),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ponów analizę" }));
    expect(getWaterAssessment).toHaveBeenCalledTimes(2);
  });

  it("shows a dedicated state outside the modeled active season", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      dataAvailability: "partial",
      availableScenarioConclusion: null,
      phenology: {
        ...completeWaterAssessment.phenology,
        status: "outside-active-season",
        activeScenarioCount: 0,
      },
      reasonCodes: ["ANALYSIS_OUTSIDE_MODELED_SEASON"],
    });

    renderSummary();

    expect(
      await screen.findByRole("heading", {
        name: "Wybrana uprawa jest poza modelowanym okresem aktywnego wzrostu",
      }),
    ).not.toBeNull();
  });

  it("offers a conscious switch to the latest contiguous complete weather date", async () => {
    const onAnalysisDateChange = vi.fn();
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      dataAvailability: "partial",
      availableScenarioConclusion: null,
      weather: {
        ...completeWaterAssessment.weather,
        status: "partial",
        completeDayCount: 102,
        precipitationAvailableDayCount: 102,
        et0AvailableDayCount: 102,
        missingDays: [
          {
            date: "2025-06-30",
            fields: ["precipitation", "et0"] as const,
            cause: "not-yet-published",
          },
        ],
        latestContiguousCompleteDate: "2025-06-29",
        latestCompleteAssessmentDate: "2025-06-29",
      },
      reasonCodes: ["WEATHER_SERIES_INCOMPLETE", "REQUIRED_SCENARIO_INCOMPLETE"],
    });

    renderWithQueryClient(
      <WaterSituationSummary
        analysisDate="2025-06-30"
        crop="pszenica-zwyczajna-jara"
        onAnalysisDateChange={onAnalysisDateChange}
        parcelIdentifier="141201_1.0001.6509"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Sprawdź ostatni dzień z kompletnymi danymi",
      }),
    );
    expect(onAnalysisDateChange).toHaveBeenCalledWith("2025-06-29");
  });

  it("does not offer an earlier date based on weather completeness alone", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      weather: {
        ...completeWaterAssessment.weather,
        latestContiguousCompleteDate: "2025-06-29",
        latestCompleteAssessmentDate: null,
      },
    });
    renderWithQueryClient(
      <WaterSituationSummary
        analysisDate="2025-06-30"
        crop="pszenica-zwyczajna-jara"
        parcelIdentifier="141201_1.0001.6509"
        onAnalysisDateChange={vi.fn()}
      />,
    );
    await screen.findByRole("heading", {
      name: "Model nie wskazuje obecnie ograniczenia poboru wody",
    });
    expect(
      screen.queryByRole("button", { name: "Sprawdź ostatni dzień z kompletnymi danymi" }),
    ).toBeNull();
  });

  it("keeps approximation visible next to a calculated assessment", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      crop: {
        ...completeWaterAssessment.crop,
        arimrId: "seradela-uprawna",
        modelKind: "approximate",
        profileId: "estimated-annual-legume",
      },
    });
    renderSummary();
    expect(await screen.findByText("Model przybliżony.")).not.toBeNull();
    expect(screen.getByText(/Parametry lub przebieg rozwoju uprawy oszacowano/)).not.toBeNull();
  });

  it("explains an inapplicable field-crop model without fabricating a result", async () => {
    const result: WaterAssessmentResponse = {
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      dataAvailability: "partial",
      availableScenarioConclusion: null,
      crop: {
        arimrId: "pieczarka",
        modelKind: "environment-only",
        profileId: null,
        supported: false,
      },
      phenology: { status: "unsupported-crop", scenarioCount: 0, activeScenarioCount: 0 },
      balance: {
        classification: "insufficient-data",
        scenarioConsensus: null,
        reason: null,
      },
      reasonCodes: ["CROP_PROFILE_UNSUPPORTED"],
      scenarios: {
        ...completeWaterAssessment.scenarios,
        totalCount: 0,
        completeCount: 0,
      },
    };
    vi.mocked(getWaterAssessment).mockResolvedValue(result);

    renderWithQueryClient(
      <WaterSituationSummary
        analysisDate="2025-06-30"
        crop="pieczarka"
        parcelIdentifier="141201_1.0001.6509"
      />,
    );

    expect(await screen.findByText(/nie opisuje rośliny polowej/i)).not.toBeNull();
  });

  it("explains that a missing planting date is insufficient data rather than an error", async () => {
    const result: WaterAssessmentResponse = {
      ...completeWaterAssessment,
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      dataAvailability: "partial",
      availableScenarioConclusion: null,
      phenology: { status: "missing", scenarioCount: 0, activeScenarioCount: 0 },
      balance: {
        classification: "insufficient-data",
        scenarioConsensus: null,
        reason: null,
      },
      reasonCodes: ["PHENOLOGY_REQUIRED"],
      scenarios: {
        ...completeWaterAssessment.scenarios,
        totalCount: 0,
        completeCount: 0,
        finalWaterStressCoefficient: null,
        finalRootZoneDepletionMm: null,
        stressDays: null,
        cumulativeEvapotranspirationDeficitMm: null,
      },
    };
    vi.mocked(getWaterAssessment).mockResolvedValue(result);

    renderSummary();

    expect(
      await screen.findByRole("heading", {
        name: "Dostępne są warunki pogodowe, ale nie pełna ocena wody dla uprawy",
      }),
    ).not.toBeNull();
    expect(
      screen.getByText("Do obliczenia potrzebna jest data siewu lub sadzenia."),
    ).not.toBeNull();
    expect(screen.queryByText("Nie udało się wykonać analizy")).toBeNull();
  });

  it("offers a retry after a technical failure", async () => {
    vi.mocked(getWaterAssessment)
      .mockRejectedValueOnce(
        new ApiClientError({
          code: "NETWORK_ERROR",
          message: "unavailable",
          status: 400,
        }),
      )
      .mockResolvedValueOnce(completeWaterAssessment);

    renderSummary();

    expect(await screen.findByText("Nie udało się wykonać analizy")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(
      await screen.findByRole("heading", {
        name: "Model nie wskazuje obecnie ograniczenia poboru wody",
      }),
    ).not.toBeNull();
    expect(getWaterAssessment).toHaveBeenCalledTimes(2);
  });

  it("cancels the previous query when the parcel changes", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveSecond: ((value: WaterAssessmentResponse) => void) | undefined;
    vi.mocked(getWaterAssessment).mockImplementation((request, signal) => {
      if (request.parcel.type === "identifier" && request.parcel.identifier === "first") {
        firstSignal = signal;
        return new Promise(() => {});
      }
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <WaterSituationSummary
            analysisDate="2025-06-30"
            crop="pszenica-zwyczajna-jara"
            parcelIdentifier="first"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <WaterSituationSummary
            analysisDate="2025-06-30"
            crop="pszenica-zwyczajna-jara"
            parcelIdentifier="second"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    expect(firstSignal?.aborted).toBe(true);
    resolveSecond?.({
      ...completeWaterAssessment,
      parcel: { identifier: "second", parcelNumber: "2" },
    });
    expect(
      await screen.findByRole("heading", {
        name: "Model nie wskazuje obecnie ograniczenia poboru wody",
      }),
    ).not.toBeNull();
  });
});

describe("completed crop period", () => {
  it("summarizes completed starting-water variants in one conditional sentence", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...assumptionDependentAssessment,
      analysisDate: "2025-11-21",
      evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-06-30" },
    });
    renderSummary();
    const description = await screen.findByText(
      "Jeśli na początku okresu gleba była mokra, według modelu uprawie mogło brakować wody przez 14–32 dni, a jeśli była skrajnie sucha — przez 80–97 dni.",
    );
    const note = screen.getByText(
      /Ten wynik nie opisuje wilgotności gleby w dniu 21 listopada 2025/,
    );
    expect(description.tagName).toBe("P");
    expect(note).not.toBe(description);
  });

  it("excludes incomplete results and keeps the partial-result warning", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...assumptionDependentAssessment,
      evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-06-30" },
      scenarios: {
        ...assumptionDependentAssessment.scenarios,
        completeCount: 2,
        results: [
          waterScenario({
            id: "wet",
            initialCondition: "field-capacity",
            stressDays: 1,
            stressOnFinalDay: false,
          }),
          waterScenario({
            id: "dry",
            initialCondition: "wilting-point",
            stressDays: 0,
            stressOnFinalDay: false,
          }),
          waterScenario({
            id: "incomplete",
            initialCondition: "field-capacity",
            stressDays: 99,
            stressOnFinalDay: false,
            incomplete: true,
          }),
        ],
      },
    });
    renderSummary();
    expect(
      await screen.findByText(
        "Jeśli na początku okresu gleba była mokra, według modelu uprawie mogło brakować wody przez 1 dzień, a jeśli była skrajnie sucha — przez 0 dni.",
      ),
    ).not.toBeNull();
    expect(screen.getByText(/Ukończono tylko część wariantów/)).not.toBeNull();
  });

  it("shows the actual balance end and does not call a past crop period current moisture", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      analysisDate: "2025-11-21",
      evaluation: { scope: "completed-season", evaluatedThroughDate: "2025-07-02" },
      weather: {
        ...completeWaterAssessment.weather,
        period: { ...completeWaterAssessment.weather.period, endDate: "2025-07-02" },
      },
    });
    renderSummary();
    expect(await screen.findByText("Wynik zakończonego okresu uprawy")).not.toBeNull();
    expect(
      screen.getByText(/Ten wynik nie opisuje wilgotności gleby w dniu 21 listopada 2025/),
    ).not.toBeNull();
    expect(screen.queryByText("Model nie wskazuje obecnie ograniczenia poboru wody")).toBeNull();
  });
});

describe("visible assumption-dependent scenarios", () => {
  it("explains which starting conditions produce each range directly beside the result", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue(assumptionDependentAssessment);
    renderSummary();
    const comparison = await screen.findByRole("region", { name: "Wyniki zależnie od założeń" });
    expect(
      screen.getByText(
        "Jeśli na początku okresu gleba była mokra, według modelu uprawie mogło brakować wody przez 14–32 dni, a jeśli była skrajnie sucha — przez 80–97 dni.",
      ),
    ).not.toBeNull();
    const chart = within(comparison).getByRole("figure", { name: "Zapas wody na początku okresu" });
    expect(within(chart).getByText("Mokry początek")).not.toBeNull();
    expect(within(chart).getByText("14–32 dni")).not.toBeNull();
    expect(within(chart).getByText("80–97 dni")).not.toBeNull();
    expect(
      within(comparison).getByText(/W każdej grupie zmieniają się także inne założenia/),
    ).not.toBeNull();
    fireEvent.click(within(comparison).getByText("Pełne wyniki i założenia"));
    expect(
      within(comparison).getAllByText(/ograniczenie w 1 z 2 obliczonych wariantów/),
    ).not.toBeNull();
    expect(comparison.closest("details")).toBeNull();
  });

  it("does not add a comparison when the conclusion is consistent", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue(completeWaterAssessment);
    renderSummary();
    await screen.findByRole("heading", {
      name: "Model nie wskazuje obecnie ograniczenia poboru wody",
    });
    expect(screen.queryByRole("region", { name: "Wyniki zależnie od założeń" })).toBeNull();
  });
});

describe("separate requested-date conditions", () => {
  it("leads with the requested date while keeping the ended crop's result distinct", async () => {
    const weatherSource = completeWaterAssessment.weather.source;
    if (!weatherSource) throw new Error("Missing weather source fixture.");
    const completedSeason = {
      ...completeWaterAssessment,
      analysisDate: "2025-11-21",
      evaluation: { scope: "completed-season" as const, evaluatedThroughDate: "2025-07-02" },
    };
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      analysisDate: "2025-11-21",
      status: "insufficient-data",
      assessmentLevel: "weather-context-only",
      evaluation: { scope: "analysis-day", evaluatedThroughDate: "2025-11-21" },
      completedSeason,
      requestedDateConditions: {
        date: "2025-11-21",
        ongoingDay: false,
        cropAssessment: "outside-modelled-season",
        status: "complete",
        period: { startDate: "2025-10-23", endDate: "2025-11-21", expectedDayCount: 30 },
        precipitationDayCount: 30,
        et0DayCount: 30,
        precipitationMm: 10,
        referenceEvapotranspirationMm: 40,
        differenceMm: -30,
        signal: "precipitation-below-reference-et0",
        day: { precipitationMm: 1, referenceEvapotranspirationMm: 2 },
        source: {
          ...weatherSource,
          id: "open-meteo-ecmwf-ifs",
          provider: "Open-Meteo",
          dataset: "ECMWF IFS operational analysis",
          model: "ECMWF IFS operational analysis",
          spatialResolution: "0.1° (about 9 km)",
          timeStandard: "Daily values in Europe/Warsaw",
        },
      },
    });
    renderWithQueryClient(
      <WaterSituationSummary analysisDate="2025-11-21" crop="bobik" parcelIdentifier="test" />,
    );
    expect(
      await screen.findByRole("heading", { name: "Warunki na 21 listopada 2025" }),
    ).not.toBeNull();
    expect(screen.getByText("Wynik zakończonego okresu uprawy")).not.toBeNull();
    expect(
      screen.getByText(
        /Poza modelowanym sezonem pokazujemy pogodę, bez oceny obecnego stresu uprawy/,
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(/opad był mniejszy od referencyjnego parowania o 30 mm/),
    ).not.toBeNull();
    expect(screen.queryByText("Model nie wskazuje obecnie ograniczenia poboru wody")).toBeNull();
    expect(screen.queryByText(/^Stan na /)).toBeNull();
    expect(screen.queryByText(/Bez informacji o aktualnej okrywie i wilgotności gleby/)).toBeNull();
    expect(screen.queryByText("10 mm (30/30 dni).")).toBeNull();
    expect(screen.queryByText(/Open-Meteo · ECMWF IFS operational analysis/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Sytuacja wodna Twojej działki",
      }),
    );
    const drawer = screen.getByRole("dialog");
    expect(
      within(drawer).getByRole("heading", { name: "Warunki na 21 listopada 2025" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByText(/Bez informacji o aktualnej okrywie i wilgotności gleby/),
    ).not.toBeNull();
    expect(within(drawer).getByText("10 mm (30/30 dni).")).not.toBeNull();
    expect(within(drawer).getByText("40 mm (30/30 dni).")).not.toBeNull();
    expect(within(drawer).getByText(/23 października 2025–21 listopada 2025/)).not.toBeNull();
    expect(within(drawer).getByText(/P − ET₀ opisuje warunki atmosferyczne/)).not.toBeNull();
    expect(
      within(drawer).getByText(/Open-Meteo · ECMWF IFS operational analysis.*Pobrano/),
    ).not.toBeNull();
  });
});
