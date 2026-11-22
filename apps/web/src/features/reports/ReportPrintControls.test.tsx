import type { ParcelResponse, WeatherConditionsResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWaterAssessment } from "../../api/analyses";
import { getHistoricalWaterAssessment } from "../../api/historical-analyses";
import { getRecommendations } from "../../api/recommendations";
import { getSatelliteObservationSummary } from "../../api/satellite-history";
import { getSoilProfile } from "../../api/soil-profiles";
import { getTerrainContext } from "../../api/terrain-context";
import { getWeatherConditions } from "../../api/weather-conditions";
import { historicalWaterAssessment } from "./historical-water-assessment.test-fixture";
import { ReportPrintControls } from "./ReportPrintControls";
import { completeWaterAssessment } from "./water-assessment.test-fixture";

vi.mock("../../api/analyses", async (original) => ({
  ...(await original<typeof import("../../api/analyses")>()),
  getWaterAssessment: vi.fn(),
}));
vi.mock("../../api/historical-analyses", async (original) => ({
  ...(await original<typeof import("../../api/historical-analyses")>()),
  getHistoricalWaterAssessment: vi.fn(),
}));
vi.mock("../../api/recommendations", async (original) => ({
  ...(await original<typeof import("../../api/recommendations")>()),
  getRecommendations: vi.fn(),
}));
vi.mock("../../api/soil-profiles", () => ({ getSoilProfile: vi.fn() }));
vi.mock("../../api/terrain-context", () => ({ getTerrainContext: vi.fn() }));
vi.mock("../../api/weather-conditions", () => ({ getWeatherConditions: vi.fn() }));
vi.mock("../../api/satellite-history", () => ({ getSatelliteObservationSummary: vi.fn() }));
vi.mock("react-chartjs-2", () => ({
  Bar: () => <canvas data-testid="historical-chart" />,
  Chart: () => <canvas data-testid="weather-chart" />,
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
    county: null,
    commune: null,
    cadastralDistrict: null,
  },
  provenance: { provider: "GUGiK ULDK", datasource: null, retrievedAt: "2026-11-22T10:00:00.000Z" },
};

const weather: WeatherConditionsResponse = {
  status: "partial",
  period: {
    startDate: "2025-06-01",
    endDate: "2025-06-30",
    expectedDayCount: 30,
    label: "30 days",
  },
  summary: {
    precipitationMm: 12,
    et0Mm: null,
    differenceMm: null,
    precipitationAvailableDayCount: 1,
    et0AvailableDayCount: 0,
    expectedDayCount: 30,
    precipitationComplete: false,
    et0Complete: false,
  },
  daily: [],
  history: [],
  precipitationTimeline: {
    aggregation: "daily",
    points: [],
    lowerThanHistoricalMedianCount: 0,
    comparablePointCount: 0,
    totalPointCount: 0,
  },
  precipitationReference: {
    classification: "unavailable",
    medianMm: null,
    q25Mm: null,
    q75Mm: null,
    completePeriodCount: 0,
    comparisonPeriodCount: 10,
    comparisonPeriod: null,
  },
  reference: {
    medianDifferenceMm: null,
    q25DifferenceMm: null,
    q75DifferenceMm: null,
    completePeriodCount: 0,
    comparisonPeriodCount: 10,
  },
  sample: {
    location: { type: "Point", coordinates: [21.5, 52.1] },
    method: "representative-interior-point",
  },
  source: {
    id: "test",
    provider: "Open-Meteo",
    dataset: "ERA5",
    model: "ERA5",
    spatialResolution: "25 km",
    timeStandard: "UTC",
    license: "CC BY 4.0",
    sourceUrl: "https://open-meteo.com/",
    retrievedAt: "2026-11-22T10:00:00.000Z",
  },
  limitations: ["Partial weather series"],
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportPrintControls
          parcel={parcel}
          selection={{
            parcelIdentifier: parcel.identifier,
            crop: "pszenica-zwyczajna-jara",
            dateSelection: { type: "day", date: "2025-06-30" },
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function choosePrintVariant(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Drukuj raport" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name }));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
}

beforeEach(() => {
  vi.mocked(getWaterAssessment).mockResolvedValue(completeWaterAssessment);
  vi.mocked(getHistoricalWaterAssessment).mockResolvedValue(historicalWaterAssessment);
  vi.mocked(getSoilProfile).mockRejectedValue(new Error("Unavailable"));
  vi.mocked(getTerrainContext).mockRejectedValue(new Error("Unavailable"));
  vi.mocked(getSatelliteObservationSummary).mockRejectedValue(new Error("Unavailable"));
  vi.mocked(getWeatherConditions).mockResolvedValue(weather);
  vi.mocked(getRecommendations).mockResolvedValue({
    status: "partial",
    items: [
      {
        id: "verify-field-conditions",
        category: "agronomic",
        priority: "high",
        cropPractice: "unknown",
        locations: [],
        evidence: [{ code: "incomplete-inputs", value: null, unit: null }],
        missingInputs: ["current-field-soil-moisture"],
        verification: ["field-inspection"],
      },
    ],
  });
  vi.spyOn(window, "print").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReportPrintControls", () => {
  it("keeps printing disabled until a valid parcel and analysis are selected", () => {
    render(
      <MemoryRouter>
        <ReportPrintControls parcel={null} selection={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Drukuj raport" }).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(getWaterAssessment).not.toHaveBeenCalled();
  });
  it("opens native printing only after chart and recommendation data settle, without a UI preview", async () => {
    let resolveWeather: (value: WeatherConditionsResponse) => void = () => {};
    vi.mocked(getWeatherConditions).mockReturnValue(
      new Promise((resolve) => {
        resolveWeather = resolve;
      }),
    );
    mount();
    expect(getWeatherConditions).not.toHaveBeenCalled();
    await choosePrintVariant("Raport prosty");
    await waitFor(() => expect(getRecommendations).toHaveBeenCalled());
    expect(window.print).not.toHaveBeenCalled();
    expect(screen.queryByRole("article")).toBeNull();
    expect(document.querySelector(".report-print-staging[aria-hidden='true']")).not.toBeNull();
    resolveWeather(weather);
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    expect(document.querySelector('[data-testid="historical-chart"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="weather-chart"]')).not.toBeNull();
    expect(getSatelliteObservationSummary).not.toHaveBeenCalled();
    expect(document.querySelector(".print-source-summary")?.textContent).toContain(
      "Źródło danych glebowych jest niedostępne",
    );
    fireEvent(window, new Event("afterprint"));
    await waitFor(() => expect(document.querySelector(".report-print-staging")).toBeNull());
    expect(document.body.classList.contains("has-print-report")).toBe(false);
    expect(document.title).not.toContain("HydroPlon-");
  });

  it("includes expanded methods and sources in the extended report even when sources fail", async () => {
    mount();
    await choosePrintVariant("Raport rozszerzony");
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    expect(getSatelliteObservationSummary).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".print-source-entry").length).toBeGreaterThan(2);
    expect(document.querySelector(".print-assessment-method")?.hasAttribute("open")).toBe(true);
    expect(document.querySelector(".print-source-appendix")?.textContent).toContain("FAO-56");
    expect(document.querySelector(".print-document")?.textContent).toContain(
      "Dane gleby są chwilowo niedostępne",
    );
  });

  it("cancels preparation without opening printing after the slow source returns", async () => {
    let resolveWeather: (value: WeatherConditionsResponse) => void = () => {};
    vi.mocked(getWeatherConditions).mockReturnValue(
      new Promise((resolve) => {
        resolveWeather = resolve;
      }),
    );
    mount();
    await choosePrintVariant("Raport prosty");
    fireEvent.keyDown(screen.getByRole("button", { name: "Drukuj raport" }), { key: "ArrowDown" });
    const cancel = await screen.findByRole("menuitem", { name: "Anuluj przygotowanie" });
    expect(cancel.getAttribute("data-disabled")).toBeNull();
    fireEvent.click(cancel);
    expect(screen.getByRole("button", { name: "Drukuj raport" }).getAttribute("aria-busy")).toBe(
      "false",
    );
    resolveWeather(weather);
    await waitFor(() => expect(document.querySelector(".report-print-staging")).toBeNull());
    expect(window.print).not.toHaveBeenCalled();
    expect(document.body.classList.contains("has-print-report")).toBe(false);
  });

  it("reports a browser printing failure and allows another attempt", async () => {
    vi.mocked(window.print).mockImplementation(() => {
      throw new Error("Unavailable");
    });
    mount();
    await choosePrintVariant("Raport prosty");
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(document.querySelector(".report-print-staging")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Drukuj raport" }).disabled).toBe(
      false,
    );
  });
});
