import type { SoilProfileResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSoilProfile } from "../../api/soil-profiles";
import { DataSourceDrawerProvider } from "./DataSourceDrawer";
import {
  describeRetentionProfile,
  retentionColorForValue,
  SoilProfileCard,
  SoilProfileSection,
} from "./SoilProfileCard";

vi.mock("../../api/soil-profiles", () => ({ getSoilProfile: vi.fn() }));

function prediction(value: number) {
  return { q05: value - 2, q50: value, q95: value + 2 };
}

const layers = [
  { topDepthCm: 0, bottomDepthCm: 5 },
  { topDepthCm: 5, bottomDepthCm: 15 },
  { topDepthCm: 15, bottomDepthCm: 30 },
  { topDepthCm: 30, bottomDepthCm: 60 },
  { topDepthCm: 60, bottomDepthCm: 100 },
  { topDepthCm: 100, bottomDepthCm: 200 },
].map((depth, index) => ({
  ...depth,
  sandPercent: prediction(72 + index),
  siltPercent: prediction(18 - index),
  clayPercent: prediction(10),
  soilOrganicCarbonGramsPerKilogram: prediction(24 - index * 3),
  ph: prediction(5.8 + index * 0.1),
  bulkDensityKilogramsPerCubicDecimeter: prediction(1.25 + index * 0.05),
  waterContent10KpaPercent: prediction(45 - index),
  waterContent33KpaPercent: prediction(35 - index),
  waterContent1500KpaPercent: prediction(10),
  availableWaterCapacity: {
    using33Kpa: {
      volumetricPercent: 25 - index,
      millimeters: ((25 - index) / 100) * (depth.bottomDepthCm - depth.topDepthCm) * 10,
    },
    using10Kpa: {
      volumetricPercent: 35 - index,
      millimeters: ((35 - index) / 100) * (depth.bottomDepthCm - depth.topDepthCm) * 10,
    },
  },
})) as SoilProfileResponse["layers"];

const profile: SoilProfileResponse = {
  status: "complete",
  sample: {
    location: { type: "Point", coordinates: [21.55, 52.15] },
    method: "representative-interior-point",
    spatialSupport: "single-soilgrids-cell",
  },
  layers,
  provenance: {
    provider: "ISRIC",
    dataset: "SoilGrids250m 2.0",
    resolutionMeters: 250,
    predictionStatistic: "Q0.50",
    uncertaintyInterval: "Q0.05-Q0.95",
    license: "CC BY 4.0",
    sourceUrl: "https://maps.isric.org/mapserv",
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
  limitations: [
    "single-representative-location",
    "modelled-not-field-measured",
    "nominal-250m-resolution",
    "not-current-soil-moisture",
    "not-date-specific",
    "field-capacity-method-range",
  ],
};

function layersWithRetention(values: readonly (number | null)[]): SoilProfileResponse["layers"] {
  return profile.layers.map((layer, index) => {
    const value = values[index] ?? null;
    return {
      ...layer,
      availableWaterCapacity: {
        ...layer.availableWaterCapacity,
        using33Kpa:
          value === null
            ? null
            : {
                volumetricPercent: value,
                millimeters: (value / 100) * (layer.bottomDepthCm - layer.topDepthCm) * 10,
              },
      },
    };
  }) as SoilProfileResponse["layers"];
}

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DataSourceDrawerProvider>{node}</DataSourceDrawerProvider>
    </QueryClientProvider>,
  );
}

function renderCard(node: ReactNode) {
  return render(<DataSourceDrawerProvider>{node}</DataSourceDrawerProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("retention presentation", () => {
  it("uses one stable color scale and clamps values only for presentation", () => {
    expect(retentionColorForValue(0)).toBe("#e9f5f7");
    expect(retentionColorForValue(40)).toBe("#0b527c");
    expect(retentionColorForValue(-10)).toBe("#e9f5f7");
    expect(retentionColorForValue(80)).toBe("#0b527c");
    expect(retentionColorForValue(20)).not.toBe(retentionColorForValue(0));
    expect(retentionColorForValue(20)).not.toBe(retentionColorForValue(40));
  });

  it("describes only clear depth relationships", () => {
    expect(describeRetentionProfile(layersWithRetention([10, 10, 10, 25, 25, 25]))).toMatch(
      /Górne warstwy.*mniejszą.*niż warstwy głębsze/,
    );
    expect(describeRetentionProfile(layersWithRetention([20, 20.5, 21, 20, 19.5, 20]))).toBe(
      "Zdolność zatrzymywania wody jest podobna na większości analizowanych głębokości.",
    );
    expect(describeRetentionProfile(layersWithRetention([10, null, null, null, 20, null]))).toBe(
      "Dostępne dane nie pozwalają wiarygodnie porównać zdolności zatrzymywania wody między głębokościami.",
    );
  });
});

describe("SoilProfileCard", () => {
  it("shows only the simplified retention view", async () => {
    vi.mocked(getSoilProfile).mockResolvedValue(profile);
    renderWithQueryClient(<SoilProfileSection parcelIdentifier="141211_2.0038.102" />);

    expect(
      await screen.findByRole("heading", { name: "Gleba i zatrzymywanie wody" }),
    ).not.toBeNull();
    expect(getSoilProfile).toHaveBeenCalledOnce();
    expect(screen.getByText(/Górne warstwy.*większą.*niż warstwy głębsze/)).not.toBeNull();
    expect(screen.queryByText("Metoda i źródło danych")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Gleba i zatrzymywanie wody",
      }),
    );
    const sourceDrawer = screen.getByRole("dialog");
    expect(
      within(sourceDrawer).getByRole("heading", { name: "Źródło danych glebowych" }),
    ).not.toBeNull();
    expect(within(sourceDrawer).getByText("SoilGrids250m 2.0")).not.toBeNull();
    expect(within(sourceDrawer).getByText("ISRIC")).not.toBeNull();
    expect(within(sourceDrawer).getByText("CC BY 4.0")).not.toBeNull();
    expect(within(sourceDrawer).getByText(/Q0.05-Q0.95/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/nie jest pomiar.*terenowy/)).not.toBeNull();
    fireEvent.click(
      within(sourceDrawer).getByRole("button", { name: "Zamknij informacje o źródle" }),
    );
    expect(screen.getByText("Głębokość")).not.toBeNull();
    expect(screen.getByText("0 cm")).not.toBeNull();
    expect(screen.getByText("200 cm")).not.toBeNull();
    expect(screen.queryByText("Woda dostępna / 100 l gleby")).toBeNull();
    expect(
      screen.getByText("Wartości pokazują litry potencjalnie dostępnej wody w 100 l gleby."),
    ).not.toBeNull();
    expect(screen.getByText("25 l")).not.toBeNull();
    expect(
      screen
        .getByRole("img", {
          name: "Modelowana zdolność gleby do zatrzymywania wody od 0 do 200 centymetrów",
        })
        .getAttribute("viewBox"),
    ).toBe("-57 38 730 404");
    expect(screen.queryByText(/% obj\./)).toBeNull();
    expect(document.querySelectorAll("[data-depth-scale-tick]")).toHaveLength(7);
    const valueArrows = [...document.querySelectorAll("[data-retention-arrow]")];
    expect(valueArrows).toHaveLength(6);
    expect(
      valueArrows.every(
        (arrow) =>
          arrow.getAttribute("x1") === "498" &&
          arrow.getAttribute("x2") === "470" &&
          arrow.getAttribute("y1") === arrow.getAttribute("y2"),
      ),
    ).toBe(true);
    const scaleColor = "var(--muted-foreground)";
    const depthAxis = document.querySelector("[data-depth-axis]");
    const depthArrows = [...document.querySelectorAll("[data-depth-scale-tick]")];
    expect(depthAxis?.getAttribute("stroke")).toBe(scaleColor);
    expect(depthArrows.every((arrow) => arrow.getAttribute("stroke") === scaleColor)).toBe(true);
    expect(valueArrows.every((arrow) => arrow.getAttribute("stroke") === scaleColor)).toBe(true);
    const depthLabel = screen.getByText("0 cm");
    const valueLabel = screen.getByText("25 l");
    expect(valueLabel.getAttribute("fill")).toBe(depthLabel.getAttribute("fill"));
    expect(valueLabel.getAttribute("font-size")).toBe(depthLabel.getAttribute("font-size"));
    expect(valueLabel.getAttribute("font-weight")).toBe(depthLabel.getAttribute("font-weight"));
    const soilFaces = [...document.querySelectorAll("[data-retention-face]")];
    expect(soilFaces).toHaveLength(12);
    expect(soilFaces.every((face) => face.getAttribute("stroke") === null)).toBe(true);
    const soilLayerSeparators = [...document.querySelectorAll("[data-soil-layer-separator]")];
    expect(soilLayerSeparators).toHaveLength(5);
    expect(
      soilLayerSeparators.every((separator) => separator.getAttribute("fill") === "none"),
    ).toBe(true);
    const depthArrow = document.querySelector("[data-depth-scale-tick]");
    const depthArrowLength =
      Number(depthArrow?.getAttribute("x2")) - Number(depthArrow?.getAttribute("x1"));
    expect(
      valueArrows.every(
        (arrow) =>
          Number(arrow.getAttribute("x1")) - Number(arrow.getAttribute("x2")) === depthArrowLength,
      ),
    ).toBe(true);
    const arrowPositions = valueArrows.map((arrow) => Number(arrow.getAttribute("y1")));
    expect(
      arrowPositions
        .slice(1)
        .every(
          (position, index) =>
            arrowPositions[index] !== undefined && position - arrowPositions[index] >= 30,
        ),
    ).toBe(true);
    expect(screen.queryByText("SKALA UMOWNA")).toBeNull();
    expect(screen.queryByRole("button", { name: "33 kPa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skład gleby" })).toBeNull();
    expect(screen.queryByText("Profil wartości")).toBeNull();
    expect(screen.queryByText("Q0.05–Q0.95")).toBeNull();
  });

  it("uses a neutral layer and explanation when retention data is missing", () => {
    const partialProfile: SoilProfileResponse = {
      ...profile,
      status: "partial",
      layers: layersWithRetention([null, 24, 23, 22, 21, 20]),
    };

    const { container } = renderCard(<SoilProfileCard profile={partialProfile} />);
    const missingLayer = container.querySelector('[data-soil-depth="0-5"]');

    expect(screen.getByText("Dane częściowe")).not.toBeNull();
    expect(screen.getByText("Szary wzór oznacza brak danych dla warstwy.")).not.toBeNull();
    expect(screen.getByText("Brak danych")).not.toBeNull();
    expect(missingLayer?.getAttribute("fill")).toMatch(/^url\(#/);
  });

  it("shows a neutral conclusion when every retention value is missing", () => {
    const noDataProfile: SoilProfileResponse = {
      ...profile,
      status: "no-data",
      layers: layersWithRetention([null, null, null, null, null, null]),
    };

    renderCard(<SoilProfileCard profile={noDataProfile} />);

    expect(screen.getAllByText("Brak danych")).toHaveLength(7);
    expect(screen.getByText(/Dostępne dane nie pozwalają wiarygodnie porównać/)).not.toBeNull();
  });

  it("offers a retry when the provider is unavailable", async () => {
    vi.mocked(getSoilProfile).mockRejectedValue(new Error("provider unavailable"));
    renderWithQueryClient(<SoilProfileSection parcelIdentifier="141211_2.0038.102" />);

    expect(
      await screen.findByRole("heading", { name: "Dane gleby są chwilowo niedostępne" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).not.toBeNull();
  });
});
