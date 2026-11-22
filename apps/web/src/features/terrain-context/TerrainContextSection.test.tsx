import type { ParcelResponse, TerrainContextResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTerrainContext } from "../../api/terrain-context";
import { DataSourceDrawerProvider } from "../reports/DataSourceDrawer";
import { ReportPrintContext, type ReportPrintVariant } from "../reports/report-print-context";
import { TerrainContextSection } from "./TerrainContextSection";

vi.mock("../../api/terrain-context", () => ({
  getTerrainContext: vi.fn(),
  getTerrainTexture: vi.fn(),
}));
vi.mock("./TerrainModel", () => ({
  TerrainModel: () => <div>Model terenu 3D</div>,
}));

vi.mock("../reports/PrintParcelMap", () => ({
  PrintParcelMap: ({ hydrology }: { hydrology?: { objects: { id: string }[] } | null }) => (
    <div data-testid="print-water-map" data-water-order={hydrology?.objects.map(({ id }) => id)} />
  ),
}));

vi.mock("./HydrologyMap", () => ({
  HydrologyMap: ({
    selectedId,
    highlightedId,
    onHover,
  }: {
    selectedId: string | null;
    highlightedId: string | null;
    onHover: (id: string | null) => void;
  }) => (
    <div>
      <div>Water map: {selectedId ?? "all objects"}</div>
      <div>Map highlight: {highlightedId ?? "none"}</div>
      <button
        type="button"
        onMouseEnter={() => onHover("way/11")}
        onMouseLeave={() => onHover(null)}
      >
        Map object 2
      </button>
    </div>
  ),
}));

const parcel = {
  identifier: "141201_1.0001.6509",
  parcelNumber: "6509",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [21.5, 52.1],
        [21.501, 52.1],
        [21.501, 52.101],
        [21.5, 52.1],
      ],
    ],
  },
  administrativeArea: {
    voivodeship: null,
    county: null,
    commune: null,
    cadastralDistrict: null,
  },
  provenance: {
    provider: "GUGiK ULDK",
    datasource: null,
    retrievedAt: "2026-11-21T12:00:00.000Z",
  },
} as ParcelResponse;

const surroundingsSource = {
  provider: "OpenStreetMap contributors",
  dataset: "OpenStreetMap via Overpass API",
  horizontalCrs: "EPSG:4326 projected to EPSG:2180",
  snapshotAt: "2026-11-21T11:58:00.000Z",
  retrievedAt: "2026-11-21T12:00:00.000Z",
  usageTerms: "Open Database License 1.0 (ODbL)",
  sourceUrl: "https://www.openstreetmap.org/copyright",
} as const;

const terrain = {
  status: "complete",
  parcelIdentifier: parcel.identifier,
  terrain: {
    status: "available",
    metrics: {
      minimumElevationMeters: 100.2,
      maximumElevationMeters: 103.4,
      elevationRangeMeters: 3.2,
      typicalSlopeDegrees: 1.6,
      steepSlopeP90Degrees: 2.5,
      dominantAspect: "W",
      sampledCellCount: 4,
      slopeSampleCount: 1,
    },
    grid: {
      columns: 2,
      rows: 2,
      bounds: { west: 1, south: 1, east: 3, north: 3 },
      cellSizeMeters: 1,
      heightsMeters: [100.2, 101, 102, 103.4],
    },
    parcelGeometry: {
      type: "Polygon",
      coordinates: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
    },
    verticalScale: 1,
    source: {
      provider: "GUGiK",
      dataset: "Numeryczny Model Terenu",
      horizontalCrs: "EPSG:2180",
      verticalReference: "PL-EVRF2007-NH",
      sourceDataDate: null,
      retrievedAt: "2026-11-21T12:00:00.000Z",
      usageTerms: "Free use under the Polish Geodetic and Cartographic Law",
    },
    limitations: ["Model is resampled."],
  },
  surroundings: {
    hydrology: {
      status: "available",
      searchRadiusMeters: 1_000,
      objectCount: 2,
      nearestDistanceMeters: 24.6,
      intersectsParcel: false,
      objects: [
        {
          id: "way/10",
          kind: "stream",
          name: "Struga",
          geometry: {
            type: "LineString",
            coordinates: [
              [21.5, 52.101],
              [21.501, 52.102],
            ],
          },
          distanceMeters: 24.6,
          relation: "adjacent",
        },
        {
          id: "way/11",
          kind: "ditch",
          name: null,
          geometry: {
            type: "LineString",
            coordinates: [
              [21.503, 52.1],
              [21.503, 52.102],
            ],
          },
          distanceMeters: 180,
          relation: "nearby",
        },
      ],
      source: surroundingsSource,
      limitations: ["OpenStreetMap may omit existing water objects."],
    },
    landUse: {
      status: "available",
      coveragePercent: 87.5,
      dominantClass: "agriculture",
      sampledPointCount: 80,
      classifiedPointCount: 70,
      sampleSpacingMeters: 5,
      classes: [
        { kind: "agriculture", areaPercent: 75, sampledPointCount: 60 },
        { kind: "forest", areaPercent: 12.5, sampledPointCount: 10 },
      ],
      source: surroundingsSource,
      limitations: ["Shares are estimated from a sampling grid."],
    },
  },
} satisfies TerrainContextResponse;

function renderSection(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  }),
  printVariant?: ReportPrintVariant,
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportPrintContext.Provider
        value={printVariant ? { variant: printVariant, sourceContainer: null } : null}
      >
        <DataSourceDrawerProvider>
          <TerrainContextSection parcel={parcel} />
        </DataSourceDrawerProvider>
      </ReportPrintContext.Provider>
    </QueryClientProvider>,
  );
}

function mockVisibilityObserver() {
  const observers: {
    notify: (isIntersecting: boolean) => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push({
          observe: this.observe,
          disconnect: this.disconnect,
          notify: (isIntersecting) => callback([{ isIntersecting }]),
        });
      }
    },
  );
  return observers;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("TerrainContextSection", () => {
  it("starts observing a terrain container mounted after a successful retry", async () => {
    const observers = mockVisibilityObserver();
    const recovered: TerrainContextResponse = {
      ...terrain,
      surroundings: {
        ...terrain.surroundings,
        hydrology: {
          ...terrain.surroundings.hydrology,
          objectCount: 0,
          objects: [],
          nearestDistanceMeters: null,
        },
      },
    };
    vi.mocked(getTerrainContext)
      .mockResolvedValueOnce({
        ...recovered,
        status: "partial",
        terrain: { status: "unavailable", reason: "provider-error", message: "Unavailable" },
      })
      .mockResolvedValueOnce(recovered);
    renderSection();
    const retry = await screen.findByRole("button", {
      name: "Ponów pobieranie brakujących danych",
    });
    expect(observers).toHaveLength(0);
    fireEvent.click(retry);

    expect(await screen.findByText("Dane dostępne")).not.toBeNull();
    await waitFor(() => expect(observers).toHaveLength(1));
    expect(observers[0]?.observe).toHaveBeenCalledWith(
      document.querySelector(".terrain-model-lazy"),
    );
    act(() => observers[0]?.notify(false));
    expect(screen.queryByText("Model terenu 3D")).toBeNull();
    act(() => observers[0]?.notify(true));
    expect(await screen.findByText("Model terenu 3D")).not.toBeNull();
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });

  it("loads terrain immediately when selected after visiting the water map", async () => {
    const observers = mockVisibilityObserver();
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    renderSection();
    await screen.findByText("Dane dostępne");
    expect(observers).toHaveLength(1);
    expect(screen.queryByText("Model terenu 3D")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Woda na mapie" }));
    expect(await screen.findByText("Water map: all objects")).not.toBeNull();
    expect(observers[0]?.disconnect).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Teren 3D" }));
    expect(await screen.findByText("Model terenu 3D")).not.toBeNull();
  });

  it("lets the user load terrain even if the visibility observer never reports it", async () => {
    const observers = mockVisibilityObserver();
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    const section = renderSection();
    const load = await screen.findByRole("button", { name: "Wczytaj widok 3D" });
    expect(screen.queryByText("Model terenu 3D")).toBeNull();

    fireEvent.click(load);
    expect(await screen.findByText("Model terenu 3D")).not.toBeNull();
    section.unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });

  it("presents terrain, nearby water and land-use shares with their sources", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    renderSection();

    expect(
      await screen.findByRole("heading", { name: "Teren, woda i użytkowanie działki" }),
    ).not.toBeNull();
    expect(await screen.findByText(/różnicę wysokości 3,2 m/)).not.toBeNull();
    expect(screen.getByText("Dane dostępne")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Woda w otoczeniu" })).not.toBeNull();
    expect(screen.getByText("Struga")).not.toBeNull();
    expect(screen.getByText(/około 25 m/)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Użytkowanie działki" })).not.toBeNull();
    expect(screen.getByText("Grunty rolne")).not.toBeNull();
    expect(screen.getByText("88% rozpoznane")).not.toBeNull();
    expect(await screen.findByText("Model terenu 3D")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaż źródło i jakość danych: Teren, woda i użytkowanie działki",
      }),
    );
    const sourceDrawer = screen.getByRole("dialog");
    expect(within(sourceDrawer).getByText(/Numeryczny Model Terenu/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/PL-EVRF2007-NH/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/OpenStreetMap via Overpass API/)).not.toBeNull();
    expect(within(sourceDrawer).getByText(/ODbL/)).not.toBeNull();
  });

  it("opens a fitted water map and links list selection to the map", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    renderSection();
    const viewControls = await screen.findByRole("group", { name: "Widok działki i otoczenia" });
    expect(viewControls.className).toBe("terrain-model-controls");
    expect(viewControls.parentElement?.className).toBe("terrain-spatial-view");
    expect(screen.queryByRole("button", { name: "Widok ukośny" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resetuj" })).toBeNull();
    fireEvent.click(within(viewControls).getByRole("button", { name: "Woda na mapie" }));
    expect(await screen.findByText("Water map: all objects")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pokaż obiekt 1 na mapie: Struga/ }));
    expect(await screen.findByText("Water map: way/10")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Pokaż obiekt 1 na mapie: Struga/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Teren 3D" }));
    expect(await screen.findByText("Model terenu 3D")).not.toBeNull();
  });

  it("links hover and keyboard focus in both directions without changing selection", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Woda na mapie" }));
    expect(await screen.findByText("Rów")).not.toBeNull();
    const firstRow = screen.getByRole("button", { name: /Pokaż obiekt 1 na mapie: Struga/ });
    const secondRow = screen.getByRole("button", { name: /Pokaż obiekt 2 na mapie: Rów/ });
    fireEvent.mouseEnter(firstRow);
    expect(screen.getByText("Map highlight: way/10")).not.toBeNull();
    expect(firstRow.getAttribute("data-highlighted")).toBe("true");
    expect(firstRow.getAttribute("aria-pressed")).toBe("false");
    fireEvent.mouseLeave(firstRow);
    expect(screen.getByText("Map highlight: none")).not.toBeNull();
    fireEvent.focus(secondRow);
    expect(screen.getByText("Map highlight: way/11")).not.toBeNull();
    fireEvent.blur(secondRow);
    expect(screen.getByText("Map highlight: none")).not.toBeNull();
    fireEvent.click(firstRow);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Map object 2" }));
    expect(secondRow.getAttribute("data-highlighted")).toBe("true");
    expect(firstRow.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Water map: way/10")).not.toBeNull();
    fireEvent.mouseLeave(screen.getByRole("button", { name: "Map object 2" }));
    expect(screen.getByText("Map highlight: way/10")).not.toBeNull();
    expect(secondRow.hasAttribute("data-highlighted")).toBe(false);
  });

  it("does not interpret an empty mapped-water result as confirmed absence", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      surroundings: {
        ...terrain.surroundings,
        hydrology: {
          ...terrain.surroundings.hydrology,
          objectCount: 0,
          nearestDistanceMeters: null,
          objects: [],
        },
      },
    });
    renderSection();

    expect(await screen.findByText(/nie znaleziono oznaczonych obiektów wodnych/)).not.toBeNull();
    expect(screen.getByText(/nie potwierdza braku rowów/)).not.toBeNull();
  });

  it("keeps surroundings visible when the terrain provider fails", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      status: "partial",
      terrain: {
        status: "unavailable",
        reason: "provider-error",
        message: "Model terenu jest chwilowo niedostępny.",
      },
    });
    renderSection();

    expect(await screen.findByText("Model wysokościowy jest niedostępny")).not.toBeNull();
    expect(screen.getByText("Struga")).not.toBeNull();
    expect(screen.getByText("Część danych")).not.toBeNull();
  });

  it("recovers a partial analysis without hiding water data during the retry", async () => {
    let resolveRetry: ((value: TerrainContextResponse) => void) | undefined;
    vi.mocked(getTerrainContext)
      .mockResolvedValueOnce({
        ...terrain,
        status: "partial",
        terrain: {
          status: "unavailable",
          reason: "provider-error",
          message: "The GUGiK terrain model is temporarily unavailable.",
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRetry = resolve;
          }),
      );
    renderSection();

    const retry = await screen.findByRole("button", {
      name: "Ponów pobieranie brakujących danych",
    });
    expect(screen.getByText(/To nie potwierdza braku danych/)).not.toBeNull();
    fireEvent.click(retry);
    await waitFor(() => expect(retry.getAttribute("aria-busy")).toBe("true"));
    expect(retry.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Struga")).not.toBeNull();
    expect(screen.getByText("Część danych")).not.toBeNull();

    await act(async () => resolveRetry?.(terrain));
    expect(await screen.findByText("Dane dostępne")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Teren 3D" }));
    expect(await screen.findByText(/różnicę wysokości 3,2 m/)).not.toBeNull();
    expect(screen.queryByText("Model wysokościowy jest niedostępny")).toBeNull();
  });

  it("preserves the partial result when a manual refresh fails", async () => {
    vi.mocked(getTerrainContext)
      .mockResolvedValueOnce({
        ...terrain,
        status: "partial",
        terrain: { status: "unavailable", reason: "provider-error", message: "Unavailable" },
      })
      .mockRejectedValue(new Error("Network unavailable"));
    renderSection();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ponów pobieranie brakujących danych",
      }),
    );

    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.getByText(/Nadal pokazujemy ostatni pobrany wynik/)).not.toBeNull();
    expect(screen.getByText("Struga")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Użytkowanie działki" })).not.toBeNull();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", {
            name: "Ponów pobieranie brakujących danych",
          })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  });

  it("refreshes a cached partial result on entry instead of keeping it fresh for 30 minutes", async () => {
    const client = new QueryClient();
    client.setQueryData(["terrain-context", parcel.identifier], {
      ...terrain,
      status: "partial",
      terrain: { status: "unavailable", reason: "provider-error", message: "Unavailable" },
    });
    vi.mocked(getTerrainContext).mockResolvedValue(terrain);
    renderSection(client);

    expect(await screen.findByText("Dane dostępne")).not.toBeNull();
    expect(getTerrainContext).toHaveBeenCalledOnce();
  });

  it("reuses a fresh complete result without another request", () => {
    const client = new QueryClient();
    client.setQueryData(["terrain-context", parcel.identifier], terrain);
    renderSection(client);

    expect(screen.getByText("Dane dostępne")).not.toBeNull();
    expect(getTerrainContext).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", {
        name: "Ponów pobieranie brakujących danych",
      }),
    ).toBeNull();
  });

  it("offers a retry when terrain is unavailable", async () => {
    vi.mocked(getTerrainContext).mockRejectedValue(new Error("provider unavailable"));
    renderSection();

    expect(await screen.findByRole("alert", {}, { timeout: 3_000 })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).not.toBeNull();
  });

  it("does not describe missing slope samples as flat terrain", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      terrain: {
        ...terrain.terrain,
        metrics: {
          ...terrain.terrain.metrics,
          typicalSlopeDegrees: null,
          steepSlopeP90Degrees: null,
          dominantAspect: null,
          slopeSampleCount: 0,
        },
      },
    });
    renderSection();

    expect(await screen.findByText(/Brakuje próbek do wyznaczenia/)).not.toBeNull();
    expect(screen.getAllByText("brak danych")).not.toHaveLength(0);
    expect(screen.queryByText("teren płaski")).toBeNull();
  });
});

describe("simple report water surroundings", () => {
  it("prints the four nearest water objects even when elevation is unavailable", async () => {
    const hydrology = terrain.surroundings.hydrology;
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      status: "partial",
      terrain: { status: "unavailable", reason: "provider-error", message: "Unavailable" },
      surroundings: {
        ...terrain.surroundings,
        hydrology: {
          ...hydrology,
          objectCount: 6,
          objects: [
            ...hydrology.objects,
            ...hydrology.objects.slice(1, 2).flatMap((object) =>
              Array.from({ length: 4 }, (_, index) => ({
                ...object,
                id: `way/${index + 20}`,
                name: `Obiekt ${index + 3}`,
              })),
            ),
          ],
        },
      },
    });
    renderSection(undefined, "simple");

    expect(await screen.findByRole("heading", { name: "Woda wokół działki" })).not.toBeNull();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("Struga · Strumień lub mały ciek")).not.toBeNull();
    expect(within(table).getByText("25 m")).not.toBeNull();
    expect(table.textContent).toContain("Obiekt 4");
    expect(table.textContent).not.toContain("Obiekt 5");
    expect(screen.getByTestId("print-water-map")).not.toBeNull();
    expect(screen.getByText(/Stan danych:/).textContent).toContain("ODbL");
    expect(screen.getByText(/Także dla dat historycznych/)).not.toBeNull();
    expect(screen.queryByText("Model wysokościowy jest niedostępny")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Użytkowanie działki" })).toBeNull();
  });

  it("distinguishes a water feature crossing the parcel from an adjacent one", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      surroundings: {
        ...terrain.surroundings,
        hydrology: {
          ...terrain.surroundings.hydrology,
          intersectsParcel: true,
          nearestDistanceMeters: 0,
          objects: terrain.surroundings.hydrology.objects.slice(0, 1).map((object) => ({
            ...object,
            relation: "intersects-parcel",
            distanceMeters: 0,
          })),
          objectCount: 1,
        },
      },
    });
    renderSection(undefined, "simple");

    expect(
      await screen.findByText(/Co najmniej jeden oznaczony obiekt wodny przecina działkę/),
    ).not.toBeNull();
    expect(within(screen.getByRole("table")).getByText("na działce")).not.toBeNull();
  });

  it("explains an empty source without claiming that there is no water", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      surroundings: {
        ...terrain.surroundings,
        hydrology: {
          ...terrain.surroundings.hydrology,
          objectCount: 0,
          objects: [],
          nearestDistanceMeters: null,
        },
      },
    });
    renderSection(undefined, "simple");

    expect(await screen.findByText(/nie znaleziono oznaczonych obiektów wodnych/)).not.toBeNull();
    expect(screen.getByText(/Brak oznaczeń w źródle nie potwierdza braku wody/)).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByTestId("print-water-map")).not.toBeNull();
  });

  it("prints hydrology unavailability separately from an empty result", async () => {
    vi.mocked(getTerrainContext).mockResolvedValue({
      ...terrain,
      status: "partial",
      surroundings: {
        ...terrain.surroundings,
        hydrology: { status: "unavailable", reason: "provider-error", message: "Unavailable" },
      },
    });
    renderSection(undefined, "simple");

    expect(await screen.findByText(/Nie udało się pobrać warstwy obiektów wodnych/)).not.toBeNull();
    expect(screen.queryByTestId("print-water-map")).toBeNull();
    expect(screen.queryByText(/nie znaleziono oznaczonych obiektów wodnych/)).toBeNull();
  });
});
