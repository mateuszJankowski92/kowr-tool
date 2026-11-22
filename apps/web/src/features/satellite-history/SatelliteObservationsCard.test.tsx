import type {
  ParcelResponse,
  SatelliteObservationSummaryResponse,
  WaterAssessmentResponse,
} from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWaterAssessment } from "../../api/analyses";
import { getSatelliteObservationSummary } from "../../api/satellite-history";
import { DataSourceDrawerProvider } from "../reports/DataSourceDrawer";
import { completeWaterAssessment } from "../reports/water-assessment.test-fixture";
import { SatelliteObservationsCard } from "./SatelliteObservationsCard";

vi.mock("../../api/satellite-history", () => ({
  getSatelliteObservationSummary: vi.fn(),
}));
vi.mock("../../api/analyses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/analyses")>()),
  getWaterAssessment: vi.fn(),
}));
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="vegetation-chart" />,
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

const quality = {
  assessment: "sufficient" as const,
  geometryPixelCount: 100,
  thresholdPercent: 70,
  validPixelCount: 86,
  rejectedPixelCounts: null,
};

const availableResult: SatelliteObservationSummaryResponse = {
  analysisDate: "2026-05-15",
  history: [
    { date: "2026-04-18", ndmi: 0.46, quality, validPixelPercent: 82 },
    { date: "2026-04-23", ndmi: 0.42, quality, validPixelPercent: 84 },
    { date: "2026-04-28", ndmi: 0.37, quality, validPixelPercent: 87 },
    { date: "2026-05-03", ndmi: 0.33, quality, validPixelPercent: 85 },
    { date: "2026-05-08", ndmi: 0.28, quality, validPixelPercent: 88 },
    { date: "2026-05-13", ndmi: 0.24, quality, validPixelPercent: 86 },
  ],
  limitations: [],
  provenance: {
    collection: "sentinel-2-l2a",
    license: "Contains modified Copernicus Sentinel data",
    provider: "Copernicus Data Space Ecosystem",
    retrievedAt: "2026-05-15T12:00:00.000Z",
    sourceUrl: "https://stac.dataspace.copernicus.eu/v1/search",
  },
  reason: null,
  searchPeriod: { from: "2026-03-16", maxLookbackDays: 60, to: "2026-05-15" },
  selectedObservation: {
    acquiredAt: "2026-05-13T10:00:00Z",
    date: "2026-05-13",
    id: "observation-1",
    indicators: {
      ndmi: { median: 0.24, quality, validPixelPercent: 86 },
      ndvi: { median: 0.62, quality, validPixelPercent: 89 },
    },
    sceneCloudPercent: 15,
  },
  status: "available",
  trend: {
    direction: "decreasing",
    method: "mann-kendall-theil-sen",
    observationCount: 6,
    pValue: 0.01,
    slopePerDay: -0.008,
  },
};

function renderCard(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DataSourceDrawerProvider>{node}</DataSourceDrawerProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("SatelliteObservationsCard", () => {
  it("shows the latest useful observation and a data-backed trend", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue(availableResult);

    renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    expect(await screen.findByText("Ostatnia użyteczna obserwacja")).not.toBeNull();
    expect(screen.getAllByText("13 maj 2026")).toHaveLength(2);
    expect(screen.getByText("Dane dostępne")).not.toBeNull();
    expect(
      screen.getByText(/Użyteczne dane dla 86% analizowanej powierzchni działki/),
    ).not.toBeNull();
    expect(screen.getByText(/Pokrycie danymi mówi, jaką część działki/)).not.toBeNull();
    expect(screen.getByText("Wskaźnik NDMI obniżył się w analizowanym okresie.")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Wskaźnik uwodnienia roślinności (NDMI)" }),
    ).not.toBeNull();
    const chart = screen.getByRole("img", {
      name: "Wykres NDMI: 6 użytecznych obserwacji satelitarnych",
    });
    for (const id of chart.getAttribute("aria-describedby")?.split(" ") ?? []) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.getByText(/To nie jest pomiar wilgotności gleby/)).not.toBeNull();
    expect(screen.getByText(/wartość 0,5 nie oznacza 50% wilgotności/)).not.toBeNull();
    expect(screen.getByText(/Dla uprawy „Pszenica zwyczajna ozima”/)).not.toBeNull();
    expect(screen.getByTestId("vegetation-chart")).not.toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Obserwacje satelitarne",
      }),
    );
    const sourceDrawer = screen.getByRole("dialog");
    expect(
      within(sourceDrawer).getByRole("heading", { name: "Źródło danych satelitarnych" }),
    ).not.toBeNull();
    expect(
      within(sourceDrawer).getByText("Copernicus Sentinel-2 L2A · mediana NDMI"),
    ).not.toBeNull();
    expect(within(sourceDrawer).getByText(/nie potwierdza samodzielnie suszy/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/jeden piksel obejmuje około 20 × 20 m/)).not.toBeNull();
    expect(
      within(sourceDrawer).getByText(/Contains modified Copernicus Sentinel data/),
    ).not.toBeNull();
    expect(getSatelliteObservationSummary).toHaveBeenCalledWith(
      { analysisDate: "2026-05-15", geometry: parcel.geometry },
      expect.any(AbortSignal),
    );
  });

  it.each([
    ["increasing", "Wskaźnik NDMI wzrósł w analizowanym okresie."],
    ["no-clear-change", "Wskaźnik NDMI nie wykazuje wyraźnego kierunku zmian."],
  ] as const)(
    "describes %s as an index trend without implying crop recovery",
    async (direction, summary) => {
      vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
        ...availableResult,
        trend: { ...availableResult.trend, direction },
      });
      renderCard(
        <SatelliteObservationsCard cropLabel="Bobik" parcel={parcel} throughDate="2026-05-15" />,
      );

      const trend = await screen.findByText(summary);
      expect(trend.className).not.toMatch(/emerald|success/);
      expect(
        screen.getByText(/ani potwierdzenie, że uprawa jest w dobrej kondycji/),
      ).not.toBeNull();
    },
  );

  it("does not claim a trend from one useful observation", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
      ...availableResult,
      history: availableResult.history.slice(0, 1),
      trend: {
        direction: "insufficient",
        method: "mann-kendall-theil-sen",
        observationCount: 1,
        pValue: null,
        slopePerDay: null,
      },
    });

    renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    expect(await screen.findByText(/nie pozwalają jeszcze wiarygodnie określić/)).not.toBeNull();
    expect(screen.getByText(/pojedyncze obserwacje/)).not.toBeNull();
  });

  it("does not claim a trend from two useful observations", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
      ...availableResult,
      history: availableResult.history.slice(0, 2),
      trend: {
        direction: "insufficient",
        method: "mann-kendall-theil-sen",
        observationCount: 2,
        pValue: null,
        slopePerDay: null,
      },
    });

    renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    expect(await screen.findByText(/nie pozwalają jeszcze wiarygodnie określić/)).not.toBeNull();
    expect(screen.getByText(/pojedyncze obserwacje/)).not.toBeNull();
  });

  it("updates crop context without refetching the satellite series", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue(availableResult);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <SatelliteObservationsCard
            cropLabel="Pszenica zwyczajna ozima"
            parcel={parcel}
            throughDate="2026-05-15"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Dla uprawy „Pszenica zwyczajna ozima”/)).not.toBeNull();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <SatelliteObservationsCard
            cropLabel="Kukurydza na ziarno"
            parcel={parcel}
            throughDate="2026-05-15"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Dla uprawy „Kukurydza na ziarno”/)).not.toBeNull();
    expect(getSatelliteObservationSummary).toHaveBeenCalledTimes(1);
  });

  it("keeps partial observations visibly separate from qualified data", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
      ...availableResult,
      reason: "partial-coverage",
      status: "limited",
      history: [],
      trend: {
        direction: "insufficient",
        method: "mann-kendall-theil-sen",
        observationCount: 0,
        pValue: null,
        slopePerDay: null,
      },
    });

    renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    expect(await screen.findByText("Dane satelitarne ograniczone")).not.toBeNull();
    expect(screen.getByText(/nie obejmują wystarczającej części działki/)).not.toBeNull();
    expect(screen.queryByText("Ostatnia użyteczna obserwacja")).toBeNull();
    expect(screen.getByText(/Brak użytecznych obserwacji do pokazania/)).not.toBeNull();
    expect(screen.queryByRole("img", { name: /Wykres NDMI/ })).toBeNull();
    expect(screen.queryByText(/Wskaźnik NDMI obniżył się/)).toBeNull();
  });

  it("explains when no useful observation exists in the lookback window", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
      ...availableResult,
      reason: "no-observations",
      history: [],
      selectedObservation: null,
      status: "unavailable",
      trend: {
        direction: "insufficient",
        method: "mann-kendall-theil-sen",
        observationCount: 0,
        pValue: null,
        slopePerDay: null,
      },
    });

    renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    expect(await screen.findByText("Brak wystarczających danych satelitarnych")).not.toBeNull();
    expect(screen.getByText(/nie zostały wykorzystane do oceny sytuacji wodnej/)).not.toBeNull();
  });

  it("offers a retry after a provider error", async () => {
    vi.mocked(getSatelliteObservationSummary)
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(availableResult);

    renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText("Ostatnia użyteczna obserwacja")).not.toBeNull();
    expect(getSatelliteObservationSummary).toHaveBeenCalledTimes(2);
  });

  it("does not display the previous result after the parcel or date changes", async () => {
    const selectedObservation = availableResult.selectedObservation;
    if (!selectedObservation) throw new Error("The available result fixture needs an observation.");
    let resolveFirst: ((value: SatelliteObservationSummaryResponse) => void) | undefined;
    vi.mocked(getSatelliteObservationSummary)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...availableResult,
        analysisDate: "2026-04-20",
        selectedObservation: {
          ...selectedObservation,
          date: "2026-04-18",
        },
      });
    const secondParcel = { ...parcel, identifier: "141201_1.0001.6510", parcelNumber: "6510" };
    const view = renderCard(
      <SatelliteObservationsCard
        cropLabel="Pszenica zwyczajna ozima"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );

    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DataSourceDrawerProvider>
          <SatelliteObservationsCard
            cropLabel="Pszenica zwyczajna ozima"
            parcel={secondParcel}
            throughDate="2026-04-20"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findAllByText("18 kwi 2026")).toHaveLength(2);
    resolveFirst?.(availableResult);
    await waitFor(() => expect(screen.queryAllByText("13 maj 2026")).toHaveLength(0));
  });
});

describe("shared crop assumptions", () => {
  it("reuses the central assessment for the same parcel, crop, date and sowing assumption", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue(availableResult);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sharedKey = [
      "water-assessment",
      parcel.identifier,
      "pszenica-zwyczajna-jara",
      "2026-05-15",
      "2026-03-18",
    ];
    const centralRequest = vi.fn(() => new Promise(() => {}));
    void queryClient.fetchQuery({ queryKey: sharedKey, queryFn: centralRequest });
    render(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <SatelliteObservationsCard
            crop="pszenica-zwyczajna-jara"
            cropLabel="Pszenica zwyczajna jara"
            parcel={parcel}
            throughDate="2026-05-15"
            seasonStartDate="2026-03-18"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Ostatnia użyteczna obserwacja")).not.toBeNull();
    expect(queryClient.getQueryCache().findAll({ queryKey: ["water-assessment"] })).toHaveLength(1);
    expect(centralRequest).toHaveBeenCalledOnce();
  });
});

describe("satellite interpretation context", () => {
  function showAssessment(assessment: WaterAssessmentResponse) {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue(availableResult);
    vi.mocked(getWaterAssessment).mockResolvedValue(assessment);
    return renderCard(
      <SatelliteObservationsCard
        crop="bobik"
        cropLabel="Bobik"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );
  }

  it.each(["completed-season", "separate-completed-season"] as const)(
    "explains a skipped comparison for %s without inventing missing observations",
    async (representation) => {
      const completedSeason: WaterAssessmentResponse = {
        ...completeWaterAssessment,
        evaluation: { scope: "completed-season", evaluatedThroughDate: "2026-07-02" },
      };
      showAssessment({
        ...completeWaterAssessment,
        ...(representation === "completed-season"
          ? { evaluation: completedSeason.evaluation }
          : {
              evaluation: { scope: "analysis-day", evaluatedThroughDate: "2026-11-21" },
              completedSeason,
            }),
        phenology: {
          ...completeWaterAssessment.phenology,
          status: "outside-active-season",
          activeScenarioCount: 0,
        },
      });

      const seasonContext = await screen.findByText("Obserwacje poza modelowanym sezonem uprawy");
      const trend = screen.getByText("Wskaźnik NDMI obniżył się w analizowanym okresie.");
      expect(
        seasonContext.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.getByText(/Bilans uprawy obejmuje zakończony okres do 2 lip 2026/),
      ).not.toBeNull();
      expect(
        screen.getByText(/Nie potwierdzamy, że pokazana roślinność to ta uprawa/),
      ).not.toBeNull();
      expect(screen.queryByText(/co najmniej czterech/)).toBeNull();
      expect(screen.getByTestId("vegetation-chart")).not.toBeNull();
    },
  );

  it("does not confuse a skipped comparison with insufficient observations", async () => {
    showAssessment(completeWaterAssessment);
    expect(await screen.findByText(/Dla tej analizy nie wykonano porównania/)).not.toBeNull();
    expect(screen.queryByText(/co najmniej czterech/)).toBeNull();
    expect(screen.getByText(/Model korzysta z założeń o rozwoju uprawy/)).not.toBeNull();
  });

  it.each([
    ["insufficient-trend", /co najmniej czterech użytecznych obserwacji/],
    [
      "outside-comparable-growth-stage",
      /Nie wszystkie zdjęcia pochodzą ze środkowej fazy rozwoju uprawy/,
    ],
    ["phenology-unavailable", /Brakuje danych pozwalających określić modelowany okres/],
    ["limited-observation-quality", /Zbyt mała część działki ma dane odpowiedniej jakości/],
    ["observation-too-old", /starsza niż 14 dni względem daty analizy/],
  ] as const)("explains the actual qualification failure: %s", async (reason, message) => {
    showAssessment({
      ...completeWaterAssessment,
      satellite: { ...completeWaterAssessment.satellite, interpretationReason: reason },
    });
    expect(await screen.findByText(message)).not.toBeNull();
  });

  it("shows loading and a recoverable comparison error without hiding the observations", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue(availableResult);
    let rejectComparison: ((error: Error) => void) | undefined;
    vi.mocked(getWaterAssessment)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectComparison = reject;
          }),
      )
      .mockResolvedValueOnce(completeWaterAssessment);
    renderCard(
      <SatelliteObservationsCard
        crop="bobik"
        cropLabel="Bobik"
        parcel={parcel}
        throughDate="2026-05-15"
      />,
    );
    expect(await screen.findByText(/Sprawdzamy, czy obserwacje można porównać/)).not.toBeNull();
    rejectComparison?.(new Error("assessment unavailable"));
    fireEvent.click(await screen.findByRole("button", { name: "Ponów porównanie" }));
    expect(await screen.findByText(/Dla tej analizy nie wykonano porównania/)).not.toBeNull();
    expect(screen.getByTestId("vegetation-chart")).not.toBeNull();
    expect(getWaterAssessment).toHaveBeenCalledTimes(2);
  });

  it("warns that three observations are insufficient for a trend", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
      ...availableResult,
      history: availableResult.history.slice(0, 3),
      trend: {
        ...availableResult.trend,
        direction: "insufficient",
        observationCount: 3,
        pValue: null,
        slopePerDay: null,
      },
    });
    renderCard(
      <SatelliteObservationsCard cropLabel="Bobik" parcel={parcel} throughDate="2026-05-15" />,
    );
    expect(await screen.findByText(/pojedyncze obserwacje/)).not.toBeNull();
  });

  it("distinguishes unavailable calculations from rejected observation quality", async () => {
    vi.mocked(getSatelliteObservationSummary).mockResolvedValue({
      ...availableResult,
      status: "unavailable",
      reason: "statistics-unavailable",
      selectedObservation: null,
      history: [],
      limitations: ["NDMI parcel statistics are unavailable."],
    });
    renderCard(
      <SatelliteObservationsCard cropLabel="Bobik" parcel={parcel} throughDate="2026-05-15" />,
    );
    expect(await screen.findByText(/Znamy daty zdjęć, ale nie udało się obliczyć/)).not.toBeNull();
    expect(screen.queryByText(/Nie znaleziono obserwacji o wystarczającej jakości/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Pokaż źródło i jakość danych: Obserwacje satelitarne" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText(
        /Nie udało się pobrać wskaźnika uwodnienia roślinności NDMI/,
      ),
    ).not.toBeNull();
  });
});
