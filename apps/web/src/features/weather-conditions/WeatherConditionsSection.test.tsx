import type { ParcelResponse, WeatherConditionsResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWeatherConditions } from "../../api/weather-conditions";
import { DataSourceDrawerProvider } from "../reports/DataSourceDrawer";
import { WeatherConditionsSection } from "./WeatherConditionsSection";

vi.mock("../../api/weather-conditions", () => ({ getWeatherConditions: vi.fn() }));
const { barMock } = vi.hoisted(() => ({ barMock: vi.fn() }));
vi.mock("react-chartjs-2", () => ({
  Chart: (props: unknown) => {
    barMock(props);
    return <div data-testid="weather-chart" />;
  },
}));

const parcel: ParcelResponse = {
  identifier: "141201_1.0001.6509",
  parcelNumber: "6509",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.5, 52.1],
        [21.6, 52.1],
        [21.6, 52.2],
        [21.5, 52.1],
      ],
    ],
  },
  administrativeArea: {
    voivodeship: "mazowieckie",
    county: "powiat miński",
    commune: "Mińsk Mazowiecki",
    cadastralDistrict: "Mińsk Mazowiecki",
  },
  provenance: {
    provider: "GUGiK ULDK",
    datasource: "powiat miński (wfs)",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
};

const response: WeatherConditionsResponse = {
  status: "partial",
  period: {
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    expectedDayCount: 30,
    label: "Ostatnie 30 dni",
  },
  summary: {
    precipitationMm: 40,
    et0Mm: null,
    differenceMm: null,
    precipitationAvailableDayCount: 30,
    et0AvailableDayCount: 0,
    expectedDayCount: 30,
    precipitationComplete: true,
    et0Complete: false,
  },
  daily: [
    {
      date: "2026-06-01",
      precipitationMm: 0,
      et0Mm: null,
      temperatureMeanCelsius: 18,
      temperatureMinCelsius: 12,
      temperatureMaxCelsius: 24,
      solarRadiationMjPerM2: null,
    },
  ],
  precipitationTimeline: {
    aggregation: "daily",
    points: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-01",
        precipitationMm: 0,
        availableDayCount: 1,
        expectedDayCount: 1,
        complete: true,
        solarRadiationMjPerM2: null,
        solarRadiationAvailableDayCount: 0,
        historicalMedianMm: 1.5,
        differenceFromHistoricalMedianMm: -1.5,
        historicalCompletePeriodCount: 10,
        historicalComparisonPeriodCount: 10,
        historicalPeriods: Array.from({ length: 10 }, (_, index) => ({
          year: 2025 - index,
          startDate: `${2025 - index}-06-01`,
          endDate: `${2025 - index}-06-01`,
          precipitationMm: index + 1,
          availableDayCount: 1,
          expectedDayCount: 1,
          complete: true,
        })),
      },
    ],
    lowerThanHistoricalMedianCount: 1,
    comparablePointCount: 1,
    totalPointCount: 1,
  },
  history: [
    {
      year: 2026,
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      precipitationMm: 40,
      et0Mm: null,
      differenceMm: null,
      precipitationComplete: true,
      et0Complete: false,
      complete: false,
      selected: true,
    },
  ],
  precipitationReference: {
    classification: "typical",
    medianMm: 42,
    q25Mm: 30,
    q75Mm: 55,
    completePeriodCount: 10,
    comparisonPeriodCount: 10,
    comparisonPeriod: { startDate: "2026-06-01", endDate: "2026-06-30", dayCount: 30 },
  },
  reference: {
    medianDifferenceMm: null,
    q25DifferenceMm: null,
    q75DifferenceMm: null,
    completePeriodCount: 0,
    comparisonPeriodCount: 10,
  },
  sample: {
    location: { type: "Point", coordinates: [21.55, 52.15] },
    method: "representative-interior-point",
  },
  source: {
    id: "nasa-power-daily",
    provider: "NASA POWER",
    dataset: "POWER Daily API",
    model: "MERRA-2 / GEOS-IT",
    spatialResolution: "Meteorology 0.5° × 0.625°; solar radiation 1°",
    timeStandard: "Daily values in UTC",
    license: "NASA open data; attribution requested",
    sourceUrl: "https://power.larc.nasa.gov/api/temporal/daily/point",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
  limitations: ["One model grid cell."],
};

function sectionNode(queryClient: QueryClient, selectedParcel = parcel) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataSourceDrawerProvider>
        <MemoryRouter initialEntries={["/?weatherPeriod=30-days"]}>
          <WeatherConditionsSection
            crop="pszenica-zwyczajna-ozima"
            dateSelection={{ type: "day", date: "2026-06-30" }}
            parcel={selectedParcel}
          />
        </MemoryRouter>
      </DataSourceDrawerProvider>
    </QueryClientProvider>
  );
}

function renderSection(selectedParcel = parcel) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(sectionNode(queryClient, selectedParcel));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WeatherConditionsSection", () => {
  it("keeps missing ET0 in methodology while presenting a simple rainfall comparison", async () => {
    vi.mocked(getWeatherConditions).mockResolvedValue(response);
    renderSection();

    expect(await screen.findByText("W typowym zakresie")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Opady i warunki pogodowe" })).not.toBeNull();
    expect(screen.getByText("40,0 mm")).not.toBeNull();
    expect(screen.getByText("Pełne dane · 30 dni")).not.toBeNull();
    expect(
      screen.getByText(
        "Brak pełnych danych o promieniowaniu słonecznym dla pokazanych przedziałów.",
      ),
    ).not.toBeNull();
    expect(screen.getAllByText("Brak danych").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("weather-chart")).toHaveLength(1);
    expect(screen.queryByText("Porównaj z poprzednimi latami")).toBeNull();
    expect(screen.queryByText(/Drugi słupek to mediana kompletnych/)).toBeNull();
    expect(screen.getByText(/W 1 z 1 porównywalnych przedziałów/)).not.toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Opady i warunki pogodowe",
      }),
    ).not.toBeNull();
    expect(barMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          datasets: [
            expect.objectContaining({ label: "Aktualny okres" }),
            expect.objectContaining({ label: "Mediana z poprzednich 10 lat" }),
            expect.objectContaining({ label: "Promieniowanie słoneczne", yAxisID: "solar" }),
          ],
        }),
        options: expect.objectContaining({
          scales: expect.objectContaining({
            x: expect.objectContaining({ stacked: false }),
            y: expect.objectContaining({ stacked: false }),
          }),
        }),
      }),
    );
    expect(
      screen.getByRole("region", { name: "Przewijany wykres opadów i promieniowania słonecznego" })
        .className,
    ).toContain("overflow-x-auto");
    expect(screen.getByTestId("weather-chart").parentElement?.className).toContain("w-full");
    expect(screen.getByTestId("weather-chart").parentElement?.style.minWidth).toBe("640px");
    expect(screen.getByRole("button", { name: "Okres analizy" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "7 dni" })).toBeNull();
    expect(screen.queryByRole("button", { name: "90 dni" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Opady i warunki pogodowe",
      }),
    );
    const sourceDrawer = screen.getByRole("dialog");
    expect(within(sourceDrawer).getByText(/NASA POWER/)).not.toBeNull();
    expect(within(sourceDrawer).getByText("One model grid cell.")).not.toBeNull();
    fireEvent.click(
      within(sourceDrawer).getByRole("button", { name: "Zamknij informacje o źródle" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sezon" }));
    await waitFor(() => {
      expect(vi.mocked(getWeatherConditions).mock.calls.at(-1)?.[0].periodPreset).toBe("season");
    });
  });

  it("plots radiation on its own energy axis and preserves zero and missing values", async () => {
    const point = response.precipitationTimeline.points[0];
    if (!point) throw new Error("Expected a precipitation timeline fixture.");
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      precipitationTimeline: {
        ...response.precipitationTimeline,
        points: [
          { ...point, solarRadiationMjPerM2: 0, solarRadiationAvailableDayCount: 1 },
          {
            ...point,
            startDate: "2026-06-02",
            endDate: "2026-06-02",
            solarRadiationMjPerM2: 18.75,
            solarRadiationAvailableDayCount: 1,
          },
          {
            ...point,
            startDate: "2026-06-03",
            endDate: "2026-06-03",
            solarRadiationMjPerM2: null,
            solarRadiationAvailableDayCount: 0,
          },
        ],
      },
    });
    renderSection();
    await screen.findByTestId("weather-chart");
    expect(screen.getByText(/Niepełne dane o promieniowaniu słonecznym: 1 z 3/)).not.toBeNull();
    expect(barMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          datasets: expect.arrayContaining([
            expect.objectContaining({
              type: "line",
              data: [0, 18.75, null],
              yAxisID: "solar",
              spanGaps: false,
            }),
          ]),
        }),
        options: expect.objectContaining({
          scales: expect.objectContaining({
            solar: expect.objectContaining({
              position: "right",
              title: { display: true, text: "Promieniowanie · MJ/m²" },
            }),
          }),
        }),
      }),
    );
  });

  it("withholds a historical assessment when precipitation has an internal gap", async () => {
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      summary: {
        ...response.summary,
        precipitationMm: 38,
        precipitationAvailableDayCount: 29,
        precipitationComplete: false,
      },
      precipitationReference: {
        ...response.precipitationReference,
        classification: "unavailable",
        comparisonPeriod: null,
      },
      precipitationTimeline: {
        aggregation: "weekly",
        points: [
          {
            startDate: "2026-06-01",
            endDate: "2026-06-07",
            precipitationMm: null,
            availableDayCount: 6,
            expectedDayCount: 7,
            complete: false,
            solarRadiationMjPerM2: null,
            solarRadiationAvailableDayCount: 0,
            historicalMedianMm: 1.5,
            differenceFromHistoricalMedianMm: null,
            historicalCompletePeriodCount: 10,
            historicalComparisonPeriodCount: 10,
            historicalPeriods: response.precipitationTimeline.points[0]?.historicalPeriods ?? [],
          },
        ],
        lowerThanHistoricalMedianCount: 0,
        comparablePointCount: 0,
        totalPointCount: 1,
      },
    });
    renderSection();

    await screen.findByText("Brak wystarczających danych");
    expect(screen.queryByText(/Dane opadowe obejmują 29 z 30 dni/)).toBeNull();
    expect(screen.getByText("Brak wystarczających danych")).not.toBeNull();
    expect(screen.getByText(/29 z 30 dni · suma może być niepełna/)).not.toBeNull();
    expect(screen.getByText("Opady w kolejnych przedziałach siedmiodniowych")).not.toBeNull();
    expect(screen.getByText(/1 przedział nie ma pełnych danych/)).not.toBeNull();
    expect(
      screen.getByText(/Brakuje wystarczających danych do wiarygodnego porównania/),
    ).not.toBeNull();
  });

  it("compares a continuous available period with the same shortened historical periods", async () => {
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      period: { ...response.period, endDate: "2026-06-30", expectedDayCount: 30 },
      summary: {
        ...response.summary,
        precipitationMm: 38,
        precipitationAvailableDayCount: 29,
        precipitationComplete: false,
      },
      precipitationReference: {
        ...response.precipitationReference,
        classification: "lower",
        comparisonPeriod: { startDate: "2026-06-01", endDate: "2026-06-29", dayCount: 29 },
      },
    });
    renderSection();

    expect(await screen.findByText("10% mniej opadów niż mediana")).not.toBeNull();
    expect(screen.queryByText(/Dane opadowe są dostępne do/)).toBeNull();
    expect(screen.getByText("29 dni · dane do 29 cze")).not.toBeNull();
    expect(screen.getByText("Okres 1 cze–29 cze · mediana z 10 lat.")).not.toBeNull();
  });

  it("shows zero precipitation as a measured value", async () => {
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      summary: { ...response.summary, precipitationMm: 0 },
      precipitationReference: { ...response.precipitationReference, classification: "lower" },
    });
    renderSection();

    expect((await screen.findAllByText("0,0 mm")).length).toBeGreaterThan(0);
    expect(screen.getByText("100% mniej opadów niż mediana")).not.toBeNull();
  });

  it("shows higher precipitation as a rounded percentage above the historical median", async () => {
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      summary: { ...response.summary, precipitationMm: 63 },
      precipitationReference: { ...response.precipitationReference, classification: "higher" },
    });
    renderSection();

    expect(await screen.findByText("50% więcej opadów niż mediana")).not.toBeNull();
  });

  it("uses the real bucket range and comparison values in chart tooltips", async () => {
    const point = response.precipitationTimeline.points[0];
    if (!point) throw new Error("Expected a precipitation timeline fixture.");
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      precipitationTimeline: {
        ...response.precipitationTimeline,
        aggregation: "weekly",
        points: [
          {
            ...point,
            startDate: "2026-06-01",
            endDate: "2026-06-07",
            expectedDayCount: 7,
          },
        ],
      },
    });
    renderSection();
    await screen.findByTestId("weather-chart");

    const chart = barMock.mock.calls[0]?.[0] as {
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              title: (items: { dataIndex: number }[]) => string;
              footer: (items: { dataIndex: number }[]) => string[];
            };
          };
        };
      };
    };
    const callbacks = chart.options.plugins.tooltip.callbacks;

    expect(callbacks.title([{ dataIndex: 0 }])).toBe("1–7 czerwca 2026");
    expect(callbacks.footer([{ dataIndex: 0 }])).toEqual([
      "Różnica: −1,5 mm",
      "Porównanie: mediana z 10 lat",
    ]);
  });

  it("calls out missing historical years only when the reference is incomplete", async () => {
    vi.mocked(getWeatherConditions).mockResolvedValue({
      ...response,
      precipitationReference: {
        ...response.precipitationReference,
        completePeriodCount: 7,
        comparisonPeriodCount: 10,
      },
    });
    renderSection();

    expect(await screen.findByText("Dostępne 7 z 10 lat.")).not.toBeNull();
    expect(screen.queryByText(/Mediana z 7 lat/)).toBeNull();
  });

  it("shows a deliberate loading state", () => {
    vi.mocked(getWeatherConditions).mockImplementation(() => new Promise(() => {}));
    renderSection();

    expect(screen.getByRole("status", { name: "Pobieranie danych pogodowych" })).not.toBeNull();
  });

  it("shows a recoverable error state", async () => {
    vi.mocked(getWeatherConditions).mockRejectedValue(new Error("unavailable"));
    renderSection();

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).not.toBeNull();
  });

  it("cancels the old request when the parcel changes during loading", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const nextParcel: ParcelResponse = {
      ...parcel,
      identifier: "141201_1.0001.6510",
      parcelNumber: "6510",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20.5, 51.1],
            [20.6, 51.1],
            [20.6, 51.2],
            [20.5, 51.1],
          ],
        ],
      },
    };
    let firstSignal: AbortSignal | undefined;
    vi.mocked(getWeatherConditions).mockImplementation((request, signal) => {
      if (request.geometry === parcel.geometry) {
        firstSignal = signal;
        return new Promise(() => {});
      }
      return Promise.resolve({
        ...response,
        summary: { ...response.summary, precipitationMm: 55 },
      });
    });
    const view = render(sectionNode(queryClient));
    await waitFor(() => expect(firstSignal).toBeDefined());

    view.rerender(sectionNode(queryClient, nextParcel));

    expect(await screen.findByText("55,0 mm")).not.toBeNull();
    expect(firstSignal?.aborted).toBe(true);
  });
});
