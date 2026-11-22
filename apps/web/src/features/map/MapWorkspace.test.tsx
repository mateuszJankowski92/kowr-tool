import type { ParcelResponse } from "@kowr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BaseEvent from "ol/events/Event.js";
import { getCenter, getHeight, getWidth } from "ol/extent.js";
import ImageTile from "ol/ImageTile.js";
import type TileLayer from "ol/layer/Tile.js";
import type VectorLayer from "ol/layer/Vector.js";
import type OlMap from "ol/Map.js";
import { TileSourceEvent } from "ol/source/Tile.js";
import type WMTS from "ol/source/WMTS.js";
import TileState from "ol/TileState.js";
import { getUid } from "ol/util.js";
import type View from "ol/View.js";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getParcel } from "../../api/parcels";
import { MapWorkspace } from "./MapWorkspace";
import { MAP_RESOLUTIONS, POLAND_EXTENT } from "./map-config";

const harness = vi.hoisted(() => ({
  layers: [] as TileLayer<WMTS>[],
  parcelLayer: null as VectorLayer | null,
  map: null as Pick<OlMap, "dispatchEvent" | "getView"> | null,
  initialLayerVisibility: [] as boolean[],
  fit: vi.fn(),
}));

vi.mock("../../api/parcels", () => ({ getParcel: vi.fn() }));
vi.mock("../analysis/AnalysisSetupForm", () => ({
  AnalysisSetupForm: () => <div data-testid="analysis-setup" />,
}));
vi.mock("../reports/ReportPanel", () => ({
  ReportPanel: () => <div data-testid="report-panel" />,
  ReportResultsSection: () => <div data-testid="report-results" />,
}));
vi.mock("ol/Map.js", async () => {
  const { default: Observable } = await import("ol/Observable.js");
  return {
    default: class extends Observable {
      view: View;
      constructor(options: {
        layers: [TileLayer<WMTS>, TileLayer<WMTS>, VectorLayer];
        view: View;
      }) {
        super();
        harness.layers = [options.layers[0], options.layers[1]];
        harness.parcelLayer = options.layers[2];
        harness.initialLayerVisibility = harness.layers.map((layer) => layer.getVisible());
        harness.map = this;
        this.view = options.view;
        harness.fit = vi.spyOn(this.view, "fit");
      }
      getView() {
        return this.view;
      }
      getInteractions() {
        return { getArray: () => [], forEach: () => {} };
      }
      updateSize() {}
      render() {}
      renderSync() {}
      setTarget() {}
    },
  };
});

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
  administrativeArea: { voivodeship: null, county: null, commune: null, cadastralDistrict: null },
  provenance: { provider: "GUGiK ULDK", datasource: null, retrievedAt: "2026-11-21T12:00:00Z" },
};

const clients: QueryClient[] = [];
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function renderWorkspace(url = "/", cachedParcel?: ParcelResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cachedParcel) {
    client.setQueryData(
      ["parcel", { type: "identifier", identifier: cachedParcel.identifier }],
      cachedParcel,
    );
  }
  clients.push(client);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>
        <MapWorkspace />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.mocked(getParcel).mockReset();
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => {
    client.clear();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MapWorkspace recovery", () => {
  it.each([
    { width: 1156, height: 970, horizontalPadding: 96, verticalPadding: 128 },
    { width: 390, height: 600, horizontalPadding: 40, verticalPadding: 96 },
  ])("fits Poland closely in a $width × $height map and restores that view", (size) => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(size.width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(size.height);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    renderWorkspace();
    act(() => {
      frames.forEach((callback) => {
        callback(0);
      });
    });

    const view = harness.map?.getView();
    const expectedResolution = Math.max(
      getWidth(POLAND_EXTENT) / (size.width - size.horizontalPadding),
      getHeight(POLAND_EXTENT) / (size.height - size.verticalPadding),
    );
    expect(view?.getResolution()).toBeCloseTo(expectedResolution);
    expect(view?.getCenter()).toEqual(getCenter(POLAND_EXTENT));
    expect(MAP_RESOLUTIONS).not.toContain(view?.getResolution());

    act(() => view?.setZoom(5));
    fireEvent.click(screen.getByRole("button", { name: "Cała Polska" }));
    expect(view?.getResolution()).toBeCloseTo(expectedResolution);
    expect(view?.getCenter()).toEqual(getCenter(POLAND_EXTENT));
  });

  it("puts icon-only help and print actions together in the top navigation", async () => {
    renderWorkspace(
      `/?parcel=${parcel.identifier}&crop=ziemniak&analysisDate=2026-06-01&panel=report`,
      parcel,
    );
    const help = screen.getByRole("button", { name: "Jak korzystać z aplikacji" });
    const printer = screen.getByRole<HTMLButtonElement>("button", { name: "Drukuj raport" });
    expect(help.closest("header")).toBe(printer.closest("header"));
    expect(help.textContent).toBe("");
    expect(printer.textContent).toBe("");
    expect(printer.disabled).toBe(false);
    expect(screen.queryByRole("menuitem", { name: "Raport prosty" })).toBeNull();
    fireEvent.keyDown(printer, { key: "ArrowDown" });
    const simple = await screen.findByRole("menuitem", { name: "Raport prosty" });
    expect(screen.getByRole("menuitem", { name: "Raport rozszerzony" })).not.toBeNull();
    fireEvent.keyDown(simple, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it.each([
    "parcel=",
    "parcel=%20%20",
    `parcel=${"a".repeat(81)}`,
    `parcel=${parcel.identifier}&parcel=other`,
    "unknown=value&mapLat=invalid&panel=unknown&crop=unknown&analysisDate=invalid",
  ])("keeps unusable links recoverable without a parcel lookup: %s", (parameters) => {
    renderWorkspace(`/?${parameters}`);
    expect(
      screen.getByRole("alert", { name: "This link contains invalid settings" }),
    ).not.toBeNull();
    expect(getParcel).not.toHaveBeenCalled();
    expect(screen.queryByTestId("report-results")).toBeNull();
    expect(screen.getByRole("button", { name: "Znajdź działkę" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove invalid settings" }));

    expect(screen.queryByRole("alert", { name: "This link contains invalid settings" })).toBeNull();
    expect(screen.getByTestId("location-search").textContent).toBe("");
    expect(getParcel).not.toHaveBeenCalled();
  });

  it.each(["unknown=value", "crop=unknown", "weatherPeriod=unknown", "panel=report"])(
    "preserves valid report input during explicit recovery without mounting analysis: %s",
    async (invalidParameters) => {
      vi.mocked(getParcel).mockResolvedValue(parcel);
      renderWorkspace(
        `/?parcel=${parcel.identifier}&crop=ziemniak&analysisDate=2026-06-01&panel=report&${invalidParameters}`,
      );
      expect(await screen.findByTestId("analysis-setup")).not.toBeNull();
      expect(screen.queryByTestId("report-results")).toBeNull();
      expect(
        screen.getByRole("alert", { name: "This link contains invalid settings" }),
      ).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Remove invalid settings" }));

      expect(
        screen.queryByRole("alert", { name: "This link contains invalid settings" }),
      ).toBeNull();
      const params = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
      expect(params.get("parcel")).toBe(parcel.identifier);
      expect(params.get("analysisDate")).toBe("2026-06-01");
      expect(params.get("crop")).toBe(invalidParameters === "crop=unknown" ? null : "ziemniak");
      expect(params.has("unknown")).toBe(false);
      expect(params.has("weatherPeriod")).toBe(false);
      expect(params.has("panel")).toBe(false);
      expect(screen.getByTestId("analysis-setup")).not.toBeNull();
      expect(screen.queryByTestId("report-results")).toBeNull();
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole("heading", { name: "Co rośnie na działce?" }),
        ),
      );
    },
  );

  it("restores the report layout and imagery before parcel loading and fits without animation", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    let resolveParcel: ((value: ParcelResponse) => void) | undefined;
    vi.mocked(getParcel).mockReturnValue(
      new Promise((resolve) => {
        resolveParcel = resolve;
      }),
    );
    renderWorkspace(
      `/?parcel=${parcel.identifier}&crop=ziemniak&panel=report&analysisDate=2026-06-01`,
    );

    expect(screen.getByTestId("app-root").getAttribute("data-view")).toBe("report");
    expect(harness.initialLayerVisibility).toEqual([false, true]);
    expect(harness.map?.getView().getCenter()).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Znajdź działkę" })).toBeNull();
    expect(screen.getByRole("status", { name: "Ładowanie raportu działki" })).not.toBeNull();
    expect(screen.getByText("Ładowanie podglądu działki").classList.contains("sr-only")).toBe(true);
    expect(document.querySelector(".workspace-map-canvas")?.classList.contains("invisible")).toBe(
      true,
    );

    await act(async () => resolveParcel?.(parcel));
    expect(await screen.findByTestId("report-panel")).not.toBeNull();
    expect(harness.fit).toHaveBeenCalled();
    expect(
      harness.fit.mock.calls.every((call) => call[1]?.duration === 0 && call[1]?.maxZoom === 15),
    ).toBe(true);
    const center = harness.map?.getView().getCenter();
    act(() =>
      frames.forEach((callback) => {
        callback(0);
      }),
    );
    expect(harness.map?.getView().getCenter()).toEqual(center);
    expect(document.querySelector(".workspace-map-canvas")?.classList.contains("invisible")).toBe(
      false,
    );
  });

  it("positions a cached report parcel before the first paint", () => {
    renderWorkspace(
      `/?parcel=${parcel.identifier}&crop=ziemniak&panel=report&analysisDate=2026-06-01`,
      parcel,
    );
    expect(screen.getByTestId("report-panel")).not.toBeNull();
    expect(harness.initialLayerVisibility).toEqual([false, true]);
    expect(harness.fit).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: 0, maxZoom: 15 }),
    );
    expect(harness.parcelLayer?.getSource()?.getFeatures()).toHaveLength(1);
  });

  it("keeps a failed report parcel lookup recoverable", async () => {
    vi.mocked(getParcel).mockRejectedValue(new Error("Unavailable"));
    renderWorkspace(
      `/?parcel=${parcel.identifier}&crop=ziemniak&panel=report&analysisDate=2026-06-01`,
    );
    expect(await screen.findByRole("alert")).not.toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("app-root").getAttribute("data-view")).toBe("selection"),
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).not.toBeNull();
  });

  it("retries submitting the same parcel identifier after a failure", async () => {
    vi.mocked(getParcel)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce(parcel);
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Lub wpisz identyfikator działki"), {
      target: { value: parcel.identifier },
    });
    fireEvent.click(screen.getByRole("button", { name: "Znajdź działkę" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Znajdź działkę" }));
    expect(await screen.findByRole("button", { name: "Potwierdź tę działkę" })).not.toBeNull();
    expect(getParcel).toHaveBeenCalledTimes(2);
  });

  it.each(["invalid", "2026-02-30", "2099-01-01"])(
    "keeps invalid report links editable without mounting analysis: %s",
    async (date) => {
      vi.mocked(getParcel).mockResolvedValue(parcel);
      renderWorkspace(
        `/?parcel=${parcel.identifier}&crop=ziemniak&panel=report&analysisDate=${date}`,
      );
      expect(await screen.findByTestId("analysis-setup")).not.toBeNull();
      expect(screen.queryByTestId("report-results")).toBeNull();
    },
  );

  it("retains visible tile failures after render completion and ignores hidden layers", () => {
    renderWorkspace();
    const tile = new ImageTile([0, 0, 0], TileState.ERROR, "failed-tile", {}, () => {});
    act(() =>
      harness.layers[1]?.getSource()?.dispatchEvent(new TileSourceEvent("tileloaderror", tile)),
    );
    expect(screen.queryByText(/Nie udało się wczytać części podkładu/)).toBeNull();
    act(() => {
      harness.layers[0]?.getSource()?.dispatchEvent(new TileSourceEvent("tileloaderror", tile));
      harness.map?.dispatchEvent("rendercomplete");
    });
    expect(screen.getByText(/Nie udało się wczytać części podkładu/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Zdjęcie/ }));
    act(() =>
      harness.layers[0]?.getSource()?.dispatchEvent(new TileSourceEvent("tileloaderror", tile)),
    );
    expect(screen.queryByText(/Nie udało się wczytać części podkładu/)).toBeNull();
  });

  it("clears a timeout when the map finishes loading later", () => {
    vi.useFakeTimers();
    renderWorkspace();
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByText(/Nie udało się wczytać części podkładu/)).not.toBeNull();
    act(() => harness.map?.dispatchEvent("rendercomplete"));
    expect(screen.queryByText(/Nie udało się wczytać części podkładu/)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps failures visible only while their tiles belong to the current viewport", () => {
    renderWorkspace();
    const source = harness.layers[0]?.getSource();
    if (!source) throw new Error("Missing map source");
    const tile = new ImageTile([0, 0, 0], TileState.ERROR, "failed-tile", {}, () => {});
    const frame = (wanted: boolean) =>
      Object.assign(new BaseEvent("rendercomplete"), {
        frameState: {
          wantedTiles: { [getUid(source)]: wanted ? { [tile.getKey()]: true } : {} },
        },
      });
    act(() => {
      source.dispatchEvent(new TileSourceEvent("tileloaderror", tile));
      harness.map?.dispatchEvent(frame(true));
    });
    expect(screen.getByRole("status", { name: "Problem z podkładem mapy" }).textContent).toContain(
      "wyszukaj działkę",
    );
    act(() => harness.map?.dispatchEvent(frame(false)));
    expect(screen.queryByText(/Nie udało się wczytać części podkładu/)).toBeNull();
    act(() => harness.map?.dispatchEvent(frame(true)));
    expect(screen.getByText(/Nie udało się wczytać części podkładu/)).not.toBeNull();
    act(() => {
      source.dispatchEvent(new TileSourceEvent("tileloadend", tile));
      harness.map?.dispatchEvent(frame(true));
    });
    expect(screen.queryByText(/Nie udało się wczytać części podkładu/)).toBeNull();
  });

  it("offers a retry after a map timeout and cleans up its timer", () => {
    vi.useFakeTimers();
    const view = renderWorkspace();
    const source = harness.layers[0]?.getSource();
    if (!source) throw new Error("Missing map source");
    const refresh = vi.spyOn(source, "refresh");
    act(() => vi.advanceTimersByTime(12_000));
    fireEvent.click(screen.getByRole("button", { name: "Ponów ładowanie mapy" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Ładowanie podkładu mapy…")).not.toBeNull();
    expect(screen.getByText("Ładowanie podkładu mapy…").classList.contains("sr-only")).toBe(true);
    act(() => harness.map?.dispatchEvent("rendercomplete"));
    expect(screen.queryByText("Ładowanie podkładu mapy…")).toBeNull();
    view.unmount();
    clients.forEach((client) => {
      client.clear();
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
