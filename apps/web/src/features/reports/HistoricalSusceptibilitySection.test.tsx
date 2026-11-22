import type { HistoricalWaterAssessmentResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHistoricalWaterAssessment } from "../../api/historical-analyses";
import { ApiClientError } from "../../api/request-json";
import { DataSourceDrawerProvider } from "./DataSourceDrawer";
import { HistoricalSusceptibilitySection } from "./HistoricalSusceptibilitySection";
import { historicalWaterAssessment } from "./historical-water-assessment.test-fixture";

vi.mock("../../api/historical-analyses", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/historical-analyses")>();
  return { ...original, getHistoricalWaterAssessment: vi.fn() };
});

type MockBarProps = {
  data: { datasets: { data: unknown[] }[] };
};

vi.mock("react-chartjs-2", () => ({
  Bar: ({ data }: MockBarProps) => (
    <div
      data-testid="historical-stress-days-chart"
      data-values={JSON.stringify(data.datasets[0]?.data)}
    />
  ),
}));

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DataSourceDrawerProvider>{node}</DataSourceDrawerProvider>
    </QueryClientProvider>,
  );
}

function renderHistory(parcelIdentifier = "141211_2.0038.102") {
  return renderWithQueryClient(
    <HistoricalSusceptibilitySection
      analysisDate="2025-06-30"
      crop="pszenica-zwyczajna-jara"
      parcelIdentifier={parcelIdentifier}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HistoricalSusceptibilitySection", () => {
  it("calls the endpoint without asking for a season start", () => {
    vi.mocked(getHistoricalWaterAssessment).mockReturnValue(new Promise(() => {}));
    renderHistory();

    expect(getHistoricalWaterAssessment).toHaveBeenCalledOnce();
    expect(screen.queryByText("Potrzebna jest data siewu lub sadzenia")).toBeNull();
  });

  it("shows an independent loading state", () => {
    vi.mocked(getHistoricalWaterAssessment).mockReturnValue(new Promise(() => {}));

    renderHistory();

    expect(screen.getByText("Trwa porównywanie dziesięciu poprzednich lat.")).not.toBeNull();
  });

  it.each([
    {
      conclusion: "ambiguous" as const,
      stressCount: 0,
      ambiguousCount: 10,
      noStressCount: 0,
      expected:
        "We wszystkich 10 latach z kompletnymi danymi wynik zależy od przyjętych założeń: część wariantów wskazuje co najmniej jeden dzień ograniczenia poboru wody przez uprawę, a część nie wskazuje takiego dnia.",
    },
    {
      conclusion: "modelled-stress" as const,
      stressCount: 10,
      ambiguousCount: 0,
      noStressCount: 0,
      expected:
        "We wszystkich 10 latach z kompletnymi danymi wszystkie warianty wskazują co najmniej jeden dzień ograniczenia poboru wody przez uprawę.",
    },
    {
      conclusion: "no-modelled-stress" as const,
      stressCount: 0,
      ambiguousCount: 0,
      noStressCount: 10,
      expected:
        "We wszystkich 10 latach z kompletnymi danymi żaden wariant nie wskazuje ograniczenia poboru wody przez uprawę.",
    },
  ])(
    "summarizes $conclusion without listing empty categories",
    async ({ conclusion, stressCount, ambiguousCount, noStressCount, expected }) => {
      vi.mocked(getHistoricalWaterAssessment).mockResolvedValue({
        ...historicalWaterAssessment,
        summary: {
          ...historicalWaterAssessment.summary,
          seasonsWithModelledStress: stressCount,
          ambiguousSeasonCount: ambiguousCount,
          seasonsWithoutModelledStress: noStressCount,
          stressOccurrence: { numerator: stressCount, denominator: 10 },
          ambiguousOccurrence: { numerator: ambiguousCount, denominator: 10 },
          noStressOccurrence: { numerator: noStressCount, denominator: 10 },
        },
        seasons: historicalWaterAssessment.seasons.map((season) => ({
          ...season,
          conclusion,
          scenarios: { ...season.scenarios, conclusionsAgree: conclusion !== "ambiguous" },
        })),
      });

      renderHistory();

      expect((await screen.findByText(expected)).textContent).toBe(expected);
      expect(screen.queryByText(/W 0 z|W 0 latach|a w 0/)).toBeNull();
    },
  );

  it("presents the ten-year chart with accessible details for each year", async () => {
    vi.mocked(getHistoricalWaterAssessment).mockResolvedValue(historicalWaterAssessment);

    renderHistory();

    expect(await screen.findByTestId("historical-stress-days-chart")).not.toBeNull();
    const summary = screen.getByText(/^W 4 z 10 lat z kompletnymi danymi/);
    expect(summary.textContent).toContain("W 2 z 10 lat z kompletnymi danymi wynik zależy");
    expect(summary.textContent).toContain("W 4 z 10 lat z kompletnymi danymi żaden wariant");
    expect(screen.getByText("10 z 10 lat")).not.toBeNull();
    expect(screen.getByTestId("historical-stress-days-chart").dataset.values).toContain("[");
    expect(screen.queryByText("Najważniejszy wniosek")).toBeNull();
    fireEvent.click(screen.getByText("Porównaj poszczególne lata"));
    expect(screen.queryByRole("combobox")).toBeNull();
    for (const season of historicalWaterAssessment.seasons) {
      expect(screen.getByText(String(season.referenceYear)).closest("details")?.open).toBe(false);
    }
    const yearSummary = screen.getByText("2021");
    const yearDetails = yearSummary.closest("details");
    if (!yearDetails) throw new Error("Missing historical year details");
    fireEvent.click(yearSummary);
    expect(yearDetails.open).toBe(true);
    expect(within(yearDetails).getByText("Deficyt ET")).not.toBeNull();
    expect(within(yearDetails).getByText("Najdłuższy epizod")).not.toBeNull();
    expect(
      within(yearDetails).getByText(/Skrajnie suchy początek jest testem wrażliwości/),
    ).not.toBeNull();
    const zeroYearSummary = screen.getByText("2023");
    const zeroYearDetails = zeroYearSummary.closest("details");
    if (!zeroYearDetails) throw new Error("Missing zero-stress year details");
    fireEvent.click(zeroYearSummary);
    expect(zeroYearDetails.open).toBe(true);
    expect(within(zeroYearDetails).getAllByText("0 dni")).toHaveLength(2);
    expect(yearDetails.open).toBe(true);
    fireEvent.click(yearSummary);
    expect(yearDetails.open).toBe(false);
    expect(getHistoricalWaterAssessment).toHaveBeenCalledOnce();
    expect(screen.queryByText("Jak obliczono porównanie?")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Uprawa na tle poprzednich lat",
      }),
    );
    const sourceDrawer = screen.getByRole("dialog");
    expect(within(sourceDrawer).getByText(/Open-Meteo/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/SoilGrids250m 2.0/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/nie znamy rzeczywistego płodozmianu/i)).not.toBeNull();
  });

  it("uses only complete seasons as the denominator for a partial result", async () => {
    const seasons: HistoricalWaterAssessmentResponse["seasons"] =
      historicalWaterAssessment.seasons.map((season) =>
        season.referenceYear === 2021
          ? {
              ...season,
              status: "incomplete",
              conclusion: "unavailable",
              scenarios: { totalCount: 32, completeCount: 0, conclusionsAgree: null },
              stressDays: null,
              longestStressEpisodeDays: null,
              longestStressEpisodeDaysRange: null,
              minimumWaterStressCoefficient: null,
              minimumWaterStressCoefficientRange: null,
              finalWaterStressCoefficient: null,
              cumulativeEvapotranspirationDeficitMm: null,
              incompleteReasonCodes: ["WEATHER_UNAVAILABLE"],
              weather: {
                ...season.weather,
                status: "unavailable",
                precipitationAvailableDayCount: 0,
                et0AvailableDayCount: 0,
                source: null,
              },
            }
          : season,
      );
    const result: HistoricalWaterAssessmentResponse = {
      ...historicalWaterAssessment,
      status: "partial",
      seasons,
      summary: {
        ...historicalWaterAssessment.summary,
        completeSeasonCount: 9,
        incompleteSeasonCount: 1,
        ambiguousSeasonCount: 2,
        stressOccurrence: { numerator: 3, denominator: 9 },
        noStressOccurrence: { numerator: 4, denominator: 9 },
        ambiguousOccurrence: { numerator: 2, denominator: 9 },
        seasonsWithModelledStress: 3,
      },
    };
    vi.mocked(getHistoricalWaterAssessment).mockResolvedValue(result);

    renderHistory();

    expect(await screen.findByTestId("historical-stress-days-chart")).not.toBeNull();
    expect(screen.getByText("9 z 10 lat")).not.toBeNull();
    expect(screen.getByText(/^W 3 z 9 lat z kompletnymi danymi/)).not.toBeNull();
    expect(screen.getByText(/Wynik częściowy: pominięto 1/)).not.toBeNull();
    if (!screen.getByText("Porównaj poszczególne lata").closest("details")?.open) {
      fireEvent.click(screen.getByText("Porównaj poszczególne lata"));
    }
    const yearSummary = screen.getByText("2021");
    const yearDetails = yearSummary.closest("details");
    if (!yearDetails) throw new Error("Missing incomplete year details");
    fireEvent.click(yearSummary);
    expect(yearDetails.open).toBe(true);
    expect(
      within(yearDetails).getByText("Dla tego roku nie udało się pobrać pogody."),
    ).not.toBeNull();
    expect(within(yearDetails).queryByText("Deficyt ET")).toBeNull();
    expect(within(yearDetails).queryByText("0 dni")).toBeNull();
  });

  it("identifies estimated parameters alongside the historical conclusion", async () => {
    vi.mocked(getHistoricalWaterAssessment).mockResolvedValue({
      ...historicalWaterAssessment,
      crop: {
        ...historicalWaterAssessment.crop,
        arimrId: "seradela-uprawna",
        modelKind: "approximate",
        profileId: "estimated-annual-legume",
      },
    });
    renderHistory();
    expect(await screen.findByText("Model przybliżony.")).not.toBeNull();
    expect(screen.getByTestId("historical-stress-days-chart")).not.toBeNull();
  });

  it("explains when a field-crop model does not apply instead of showing an error", async () => {
    const result: HistoricalWaterAssessmentResponse = {
      ...historicalWaterAssessment,
      status: "insufficient-data",
      crop: {
        arimrId: "pieczarka",
        modelKind: "environment-only",
        profileId: null,
        supported: false,
      },
      summary: {
        ...historicalWaterAssessment.summary,
        completeSeasonCount: 0,
        incompleteSeasonCount: 10,
        seasonsWithModelledStress: 0,
        seasonsWithoutModelledStress: 0,
        ambiguousSeasonCount: 0,
        stressOccurrence: { numerator: 0, denominator: 0 },
        noStressOccurrence: { numerator: 0, denominator: 0 },
        ambiguousOccurrence: { numerator: 0, denominator: 0 },
        stressDaysRange: null,
        medianStressDaysRange: null,
        longestStressEpisodeDays: null,
        actualDataPeriod: null,
      },
      seasons: historicalWaterAssessment.seasons.map((season) => ({
        ...season,
        status: "incomplete",
        conclusion: "unavailable",
        scenarios: { totalCount: 0, completeCount: 0, conclusionsAgree: null },
        stressDays: null,
        longestStressEpisodeDays: null,
        longestStressEpisodeDaysRange: null,
        minimumWaterStressCoefficient: null,
        minimumWaterStressCoefficientRange: null,
        finalWaterStressCoefficient: null,
        cumulativeEvapotranspirationDeficitMm: null,
        incompleteReasonCodes: ["CROP_PROFILE_UNSUPPORTED"],
      })),
    };
    vi.mocked(getHistoricalWaterAssessment).mockResolvedValue(result);

    renderWithQueryClient(
      <HistoricalSusceptibilitySection
        analysisDate="2025-06-30"
        crop="pieczarka"
        parcelIdentifier="141211_2.0038.102"
      />,
    );

    expect(await screen.findByText("Za mało danych do porównania historycznego")).not.toBeNull();
    expect(screen.getByText(/nie opisuje rośliny polowej/i)).not.toBeNull();
    expect(screen.queryByText("Nie udało się porównać poprzednich lat")).toBeNull();
  });

  it("offers a manual retry after a technical failure", async () => {
    vi.mocked(getHistoricalWaterAssessment)
      .mockRejectedValueOnce(
        new ApiClientError({ code: "NETWORK_ERROR", message: "unavailable", status: null }),
      )
      .mockResolvedValueOnce(historicalWaterAssessment);

    renderHistory();

    expect(await screen.findByText("Nie udało się porównać poprzednich lat")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ponów analizę" }));
    expect(await screen.findByTestId("historical-stress-days-chart")).not.toBeNull();
    expect(getHistoricalWaterAssessment).toHaveBeenCalledTimes(2);
  });

  it("cancels the previous historical query when the parcel changes", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveSecond: ((value: HistoricalWaterAssessmentResponse) => void) | undefined;
    vi.mocked(getHistoricalWaterAssessment).mockImplementation((request, signal) => {
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
          <HistoricalSusceptibilitySection
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
          <HistoricalSusceptibilitySection
            analysisDate="2025-06-30"
            crop="pszenica-zwyczajna-jara"
            parcelIdentifier="second"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    expect(firstSignal?.aborted).toBe(true);
    resolveSecond?.({
      ...historicalWaterAssessment,
      parcel: { identifier: "second", parcelNumber: "2" },
    });
    expect(await screen.findByTestId("historical-stress-days-chart")).not.toBeNull();
  });

  it("clears the old result and refetches when the crop and date change", async () => {
    vi.mocked(getHistoricalWaterAssessment)
      .mockResolvedValueOnce(historicalWaterAssessment)
      .mockReturnValueOnce(new Promise(() => {}));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <HistoricalSusceptibilitySection
            analysisDate="2025-06-30"
            crop="pszenica-zwyczajna-jara"
            parcelIdentifier="141211_2.0038.102"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("historical-stress-days-chart")).not.toBeNull();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <HistoricalSusceptibilitySection
            analysisDate="2025-07-15"
            crop="ziemniak"
            parcelIdentifier="141211_2.0038.102"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Trwa porównywanie dziesięciu poprzednich lat.")).not.toBeNull();
    expect(screen.queryByTestId("historical-stress-days-chart")).toBeNull();
    expect(getHistoricalWaterAssessment).toHaveBeenLastCalledWith(
      expect.objectContaining({ analysisDate: "2025-07-15", crop: "ziemniak" }),
      expect.any(AbortSignal),
    );
  });
});

describe("incomplete history with usable scenario subsets", () => {
  it("retains calculated ranges without inventing a complete-season frequency", async () => {
    const result: HistoricalWaterAssessmentResponse = {
      ...historicalWaterAssessment,
      status: "insufficient-data",
      summary: {
        ...historicalWaterAssessment.summary,
        completeSeasonCount: 0,
        incompleteSeasonCount: 10,
      },
      seasons: historicalWaterAssessment.seasons.map((season) => ({
        ...season,
        status: "incomplete",
        conclusion: "unavailable",
        scenarios: { totalCount: 16, completeCount: 8, conclusionsAgree: null },
        incompleteReasonCodes: ["ANALYSIS_AFTER_MODELED_SEASON"],
      })),
    };
    vi.mocked(getHistoricalWaterAssessment).mockResolvedValue(result);
    renderHistory();
    expect(await screen.findByTestId("historical-stress-days-chart")).not.toBeNull();
    fireEvent.click(screen.getByText("Porównaj poszczególne lata"));
    const yearSummary = screen.getByText("2024");
    const yearDetails = yearSummary.closest("details");
    if (!yearDetails) throw new Error("Missing partially calculated year details");
    fireEvent.click(yearSummary);
    expect(within(yearDetails).getByText(/Ukończono 8 z 16 wariantów/)).not.toBeNull();
    expect(screen.getByText(/Nie wystarczają do wyliczenia częstości/)).not.toBeNull();
    expect(screen.queryByText("Za mało danych do porównania historycznego")).toBeNull();
  });
});
