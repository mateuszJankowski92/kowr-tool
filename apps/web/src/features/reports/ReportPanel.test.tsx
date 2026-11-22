import type { CropDetectionResponse, ParcelResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCropDetection } from "../../api/crop-detections";
import { cropModelCapabilitiesFixture } from "../../api/crop-model-capabilities.test-fixture";
import { ReportPanel } from "./ReportPanel";

vi.mock("../../api/crop-detections", () => ({ getCropDetection: vi.fn() }));
vi.mock("../../api/crop-model-capabilities", () => ({
  getCropModelCapabilities: vi.fn(async () => cropModelCapabilitiesFixture),
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

const cropDetection: CropDetectionResponse = {
  status: "multiple",
  complete: true,
  candidates: [
    {
      crop: "pszenica-zwyczajna-ozima",
      label: "Pszenica zwyczajna ozima",
      overlapAreaSquareMeters: 850,
      overlapPercent: 85,
    },
    {
      crop: "kukurydza-na-ziarno",
      label: "Kukurydza na ziarno",
      overlapAreaSquareMeters: 150,
      overlapPercent: 15,
    },
  ],
  provenance: {
    provider: "ARiMR GSA",
    dataset: "Deklaracje rolne 2025 - uprawy (GSA)",
    campaign: 2025,
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
};

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportPanel", () => {
  it("does not claim the selected crop is absent when declarations are incomplete", async () => {
    vi.mocked(getCropDetection).mockResolvedValue({
      ...cropDetection,
      complete: false,
      candidates: cropDetection.candidates.filter(
        ({ crop }) => crop !== "pszenica-zwyczajna-ozima",
      ),
    });
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/?crop=pszenica-zwyczajna-ozima"]}>
        <ReportPanel onBack={vi.fn()} parcel={parcel} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Niepełne dane ARiMR GSA 2025/)).not.toBeNull();
    expect(screen.queryByText("Brak tej uprawy w deklaracji ARiMR GSA 2025.")).toBeNull();
  });

  it("shows a malformed URL date without crashing", () => {
    vi.mocked(getCropDetection).mockResolvedValue(cropDetection);
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/?crop=ziemniak&analysisDate=invalid"]}>
        <ReportPanel onBack={vi.fn()} parcel={parcel} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Nieprawidłowa data")).not.toBeNull();
  });

  it("shows the selected context without inventing an analysis result", () => {
    vi.mocked(getCropDetection).mockResolvedValue(cropDetection);
    const onBack = vi.fn();
    renderWithQueryClient(
      <MemoryRouter
        initialEntries={[
          "/?crop=pszenica-zwyczajna-ozima&dateMode=range&dateFrom=2026-05-01&dateTo=2026-05-14",
        ]}
      >
        <ReportPanel onBack={onBack} parcel={parcel} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Działka 6509" })).not.toBeNull();
    expect(screen.getByText("141201_1.0001.6509")).not.toBeNull();
    expect(screen.getByText("Mińsk Mazowiecki, powiat miński, mazowieckie")).not.toBeNull();
    expect(screen.getByText("Pszenica zwyczajna ozima")).not.toBeNull();
    expect(screen.getByText("Zboża")).not.toBeNull();
    expect(screen.getByText("1 maja 2026 – 14 maja 2026")).not.toBeNull();
    expect(
      screen.getByText("Orientacyjny termin dla uprawy przyjęty automatycznie"),
    ).not.toBeNull();
    expect(screen.getByText("GUGiK ULDK · powiat miński (wfs)")).not.toBeNull();
    expect(screen.getByText(/21 lis 2026/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edytuj dane" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows the selected crop share inside its summary", async () => {
    vi.mocked(getCropDetection).mockResolvedValue(cropDetection);

    renderWithQueryClient(
      <MemoryRouter initialEntries={["/?crop=pszenica-zwyczajna-ozima"]}>
        <ReportPanel onBack={vi.fn()} parcel={parcel} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("85%")).not.toBeNull();
    expect(screen.queryByText("15%")).toBeNull();
    expect(screen.queryByText("Uprawy zadeklarowane na działce")).toBeNull();
    fireEvent.click(screen.getByText("Szczegóły działki i założenia"));
    expect(
      screen.getByRole("progressbar", {
        name: "Pszenica zwyczajna ozima: 85% powierzchni działki",
      }),
    ).not.toBeNull();
  });
});
