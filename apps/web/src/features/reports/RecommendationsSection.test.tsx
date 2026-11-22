import type { ParcelResponse, SoilProfileResponse, TerrainContextResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getWaterAssessment } from "../../api/analyses";
import { getRecommendations } from "../../api/recommendations";
import { getSoilProfile } from "../../api/soil-profiles";
import { getTerrainContext } from "../../api/terrain-context";
import { DataSourceDrawerProvider } from "./DataSourceDrawer";
import { RecommendationsSection } from "./RecommendationsSection";
import { completeWaterAssessment } from "./water-assessment.test-fixture";

vi.mock("../../api/analyses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/analyses")>()),
  getWaterAssessment: vi.fn(),
}));
vi.mock("../../api/recommendations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/recommendations")>()),
  getRecommendations: vi.fn(),
}));
vi.mock("../../api/soil-profiles", () => ({ getSoilProfile: vi.fn() }));
vi.mock("../../api/terrain-context", () => ({ getTerrainContext: vi.fn() }));
vi.mock("./RetentionLocationsMap", () => ({
  RetentionLocationsMap: ({ selection }: { selection: { key: string } | null }) => (
    <section aria-label="Test inspection map">{selection?.key}</section>
  ),
}));

const terrain = {
  terrain: {
    status: "available",
    metrics: { typicalSlopeDegrees: 2.3, elevationRangeMeters: 4.1 },
  },
  surroundings: {
    hydrology: {
      status: "available",
      intersectsParcel: false,
      nearestDistanceMeters: 56,
    },
    landUse: {
      status: "available",
      dominantClass: "agriculture",
      coveragePercent: 90,
      classes: [{ kind: "agriculture", areaPercent: 90, sampledPointCount: 90 }],
    },
  },
} as TerrainContextResponse;

const soil = {
  status: "complete",
  layers: [
    {
      bottomDepthCm: 5,
      soilOrganicCarbonGramsPerKilogram: { q50: 12 },
      availableWaterCapacity: { using33Kpa: { millimeters: 4 } },
    },
    ...[15, 30, 60, 100, 200].map((bottomDepthCm) => ({
      bottomDepthCm,
      soilOrganicCarbonGramsPerKilogram: { q50: 12 },
      availableWaterCapacity: { using33Kpa: { millimeters: 8 } },
    })),
  ],
} as unknown as SoilProfileResponse;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecommendationsSection", () => {
  it("shows evidence-linked actions and required verification", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue({
      ...completeWaterAssessment,
      balance: {
        classification: "elevated-shortage-risk",
        scenarioConsensus: "consistent-stress",
        reason: "core-scenarios-show-stress",
      },
      scenarios: {
        ...completeWaterAssessment.scenarios,
        stressDays: { minimum: 4, maximum: 9 },
        cumulativeEvapotranspirationDeficitMm: { minimum: 8, maximum: 21 },
      },
    });
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    vi.mocked(getSoilProfile).mockResolvedValue(soil);
    vi.mocked(getRecommendations).mockResolvedValue({
      status: "complete",
      items: [
        {
          id: "protect-soil-surface",
          cropPractice: "annual-standing",
          locations: [],
          category: "agronomic",
          priority: "high",
          evidence: [
            { code: "modelled-water-stress", value: 9, unit: "days" },
            { code: "agricultural-land-use", value: 90, unit: "percent" },
          ],
          missingInputs: ["field-management-history"],
          verification: ["field-inspection", "agronomist-review"],
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <DataSourceDrawerProvider>
          <RecommendationsSection
            analysisDate="2025-06-30"
            crop="pszenica-zwyczajna-jara"
            parcelIdentifier="141201_1.0001.6509"
          />
        </DataSourceDrawerProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ogranicz okresy z odkrytą glebą")).not.toBeNull();

    expect(screen.getByText("Wysoki")).not.toBeNull();
    fireEvent.click(screen.getByText("Uzasadnienie i warunki"));
    expect(screen.getByText(/oględziny w terenie, konsultacja agronomiczna/)).not.toBeNull();
    expect(screen.queryByText(/Rekomendacje będą kolejną częścią/)).toBeNull();
  });
});

function renderSection(parcel?: ParcelResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DataSourceDrawerProvider>
        <RecommendationsSection
          parcel={parcel}
          analysisDate="2025-06-30"
          crop="pszenica-zwyczajna-jara"
          parcelIdentifier="141211_2.0038.102"
        />
      </DataSourceDrawerProvider>
    </QueryClientProvider>,
  );
}

describe("recommendation recovery", () => {
  it("finishes with partial recommendations after an assessment failure and retries that source", async () => {
    vi.mocked(getWaterAssessment)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(completeWaterAssessment);
    vi.mocked(getSoilProfile).mockResolvedValue(soil);
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    vi.mocked(getRecommendations).mockResolvedValue({ status: "partial", items: [] });
    renderSection();
    expect(await screen.findByText(/Część danych jest niedostępna/)).not.toBeNull();
    expect(screen.queryByRole("status", { name: "Dobieranie rekomendacji" })).toBeNull();
    expect(getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        water: expect.objectContaining({ status: "insufficient-data", classification: null }),
        terrain: expect.objectContaining({ status: "available" }),
      }),
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ponów pobieranie brakujących danych" }));
    await screen.findByText("Część danych");
    expect(getWaterAssessment).toHaveBeenCalledTimes(2);
  });

  it("keeps recommendations useful when spatial sources fail", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue(completeWaterAssessment);
    vi.mocked(getSoilProfile).mockRejectedValue(new Error("soil unavailable"));
    vi.mocked(getTerrainContext).mockRejectedValue(new Error("terrain unavailable"));
    vi.mocked(getRecommendations).mockResolvedValue({ status: "partial", items: [] });
    renderSection();
    expect(await screen.findByText(/Część danych jest niedostępna/)).not.toBeNull();
    expect(getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        soil: expect.objectContaining({ status: "unavailable" }),
        terrain: expect.objectContaining({ status: "unavailable" }),
      }),
      expect.any(AbortSignal),
    );
  });

  it("shows an actionable error when recommendation composition fails", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue(completeWaterAssessment);
    vi.mocked(getSoilProfile).mockResolvedValue(soil);
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    vi.mocked(getRecommendations)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ status: "complete", items: [] });
    renderSection();
    expect(await screen.findByText("Nie udało się dobrać rekomendacji")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByText("Pełny kontekst")).not.toBeNull();
  });
});

describe("crop-specific practice presentation and mapped inspection places", () => {
  it("shows a location with its source and retains crop-specific applicability", async () => {
    vi.mocked(getWaterAssessment).mockResolvedValue(completeWaterAssessment);
    vi.mocked(getSoilProfile).mockResolvedValue(soil);
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    vi.mocked(getRecommendations).mockResolvedValue({
      status: "complete",
      items: [
        {
          id: "review-contour-practices",
          category: "retention",
          priority: "medium",
          cropPractice: "annual-post-season",
          evidence: [{ code: "terrain-relief", value: 2.3, unit: "degrees" }],
          missingInputs: ["detailed-runoff-survey"],
          verification: ["field-inspection"],
          locations: [
            {
              id: "nmt-cell-7",
              kind: "slope-cell",
              name: null,
              geometry: { type: "Point", coordinates: [21.5, 52.1] },
              source: "GUGiK NMT",
              resolutionMeters: 8,
              distanceMeters: 0,
            },
          ],
        },
      ],
    });
    renderSection({ geometry: { type: "Polygon", coordinates: [] } } as unknown as ParcelResponse);
    const link = await screen.findByRole("button", {
      name: "Miejsce 1: Miejsce o największym spadku w modelu terenu",
    });
    expect(screen.getByText(/Planowanie po zakończeniu modelowanego sezonu/)).not.toBeNull();
    expect(screen.getByText(/GUGiK NMT.*komórka około 8 m/)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Miejsca do oględzin" })).not.toBeNull();
    expect(screen.getByText(/w granicach działki/)).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Test inspection map" })).toBeNull();
    fireEvent.click(link);
    const map = await screen.findByRole("region", { name: "Test inspection map" });
    expect(map.textContent).toBe("slope-cell:nmt-cell-7");
    expect(map.closest("details")?.open).toBe(true);
  });
});
