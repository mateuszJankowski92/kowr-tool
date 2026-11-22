// biome-ignore-all lint/a11y/noNoninteractiveTabindex: OpenLayers requires a focusable map target for keyboard navigation.
// biome-ignore-all lint/a11y/useSemanticElements: OpenLayers requires a generic target element.
import type { ParcelResponse } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Droplets,
  HelpCircle,
  ImageIcon,
  LoaderCircle,
  MapIcon,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { easeOut } from "ol/easing.js";
import { getCenter, getHeight, getWidth } from "ol/extent.js";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Point from "ol/geom/Point.js";
import { defaults as defaultInteractions } from "ol/interaction/defaults.js";
import VectorLayer from "ol/layer/Vector.js";
import OlMap from "ol/Map.js";
import { transform } from "ol/proj.js";
import type RenderEvent from "ol/render/Event.js";
import type { TileSourceEvent } from "ol/source/Tile.js";
import VectorSource from "ol/source/Vector.js";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style.js";
import { getUid } from "ol/util.js";
import View from "ol/View.js";
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import "ol/ol.css";
import { getParcel, type ParcelLookup } from "../../api/parcels";
import { ApiClientError } from "../../api/request-json";
import { RetryButton } from "../../components/RetryButton";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Spinner } from "../../components/ui/spinner";
import { AnalysisSetupForm } from "../analysis/AnalysisSetupForm";
import { getAnalysisDateBounds } from "../analysis/analysis-date";
import { getValidAnalysisSelection } from "../analysis/analysis-search-params";
import { ReportPanel, ReportResultsSection } from "../reports/ReportPanel";
import { ReportPrintControls } from "../reports/ReportPrintControls";
import {
  canSelectParcelAtMapPosition,
  createOrthophotoLayer,
  createTopographicLayer,
  isParcelSelectionZoom,
  MAP_RESOLUTIONS,
  MAP_VIEW_EXTENT,
  POLAND_EXTENT,
  POLISH_PROJECTION,
  POLISH_PROJECTION_CODE,
} from "./map-config";
import {
  deleteMapViewSearchParameters,
  type MapUrlView,
  setMapViewSearchParameters,
} from "./map-view-url";
import { validateWorkspaceSearchParams } from "./workspace-search-params";

type BaseMap = "topographic" | "orthophoto";
type MapStatus = "loading" | "ready" | "error";

const SOURCE_DETAILS: Record<BaseMap, string> = {
  orthophoto: "Ortofotomapa standardowa",
  topographic: "Mapa podkładowa BDOO i BDOT10k",
};

const FIT_POLAND_ANIMATION_DURATION_MS = 500;
const ANALYSIS_SEARCH_PARAMETERS = [
  "analysisDate",
  "crop",
  "dateFrom",
  "dateMode",
  "dateTo",
  "panel",
] as const;

function getUrlView(view: View): MapUrlView | null {
  const center = view.getCenter();
  const zoom = view.getZoom();
  if (!center || zoom === undefined) return null;

  const geographicCenter = transform(center, POLISH_PROJECTION_CODE, "EPSG:4326");
  const longitude = geographicCenter[0];
  const latitude = geographicCenter[1];
  if (longitude === undefined || latitude === undefined) return null;

  return { latitude, longitude, zoom };
}

const candidateParcelStyle = new Style({
  fill: new Fill({ color: "rgba(37, 99, 235, 0.16)" }),
  stroke: new Stroke({ color: "#2563eb", width: 3 }),
});

const confirmedParcelStyle = new Style({
  fill: new Fill({ color: "rgba(29, 78, 216, 0.2)" }),
  stroke: new Stroke({ color: "#1d4ed8", width: 3 }),
});

const lookupPointStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: "#eff6ff" }),
    stroke: new Stroke({ color: "#2563eb", width: 3 }),
  }),
});

function getFitPadding(mapElement: HTMLDivElement): [number, number, number, number] {
  return mapElement.clientWidth < 640 ? [64, 20, 32, 20] : [80, 48, 48, 48];
}

function getParcelFitPadding(mapElement: HTMLDivElement): [number, number, number, number] {
  return getFitPadding(mapElement);
}

function getFitResolution(
  mapElement: HTMLDivElement,
  padding: [number, number, number, number],
): number {
  const [top, right, bottom, left] = padding;
  const availableWidth = Math.max(1, mapElement.clientWidth - left - right);
  const availableHeight = Math.max(1, mapElement.clientHeight - top - bottom);
  const requiredResolution = Math.max(
    getWidth(POLAND_EXTENT) / availableWidth,
    getHeight(POLAND_EXTENT) / availableHeight,
  );
  const coarsestResolution = MAP_RESOLUTIONS.at(0);

  if (coarsestResolution === undefined) {
    throw new Error("Map resolutions are not configured.");
  }

  return Math.min(requiredResolution, coarsestResolution);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
};

function startWorkspaceTransition(update: () => void, prepareSnapshot?: () => void): Promise<void> {
  const transitionDocument = document as ViewTransitionDocument;

  if (prefersReducedMotion() || !transitionDocument.startViewTransition) {
    flushSync(update);
    prepareSnapshot?.();
    return Promise.resolve();
  }

  const transition = transitionDocument.startViewTransition(() => {
    flushSync(update);
    prepareSnapshot?.();
  });
  return transition.finished.then(() => undefined);
}

function getParcelError(error: unknown): { title: string; message: string } {
  if (error instanceof ApiClientError) {
    if (error.code === "PARCEL_NOT_FOUND") {
      return {
        title: "Nie znaleziono działki",
        message: "Wskaż punkt położony wewnątrz działki albo sprawdź pełny identyfikator.",
      };
    }

    if (error.code === "PARCEL_PROVIDER_UNAVAILABLE") {
      return {
        title: "Dane ewidencyjne są chwilowo niedostępne",
        message: "Usługa GUGiK nie odpowiedziała poprawnie. Spróbuj ponownie za chwilę.",
      };
    }

    if (error.code === "NETWORK_ERROR") {
      return {
        title: "Brak połączenia z aplikacją",
        message: "Sprawdź połączenie z internetem i spróbuj ponownie.",
      };
    }
  }

  return {
    title: "Nie udało się pobrać działki",
    message: "Spróbuj ponownie lub wybierz działkę inną metodą.",
  };
}

function formatRetrievedAt(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function ParcelDetails({ parcel }: { parcel: ParcelResponse }) {
  const location = [
    parcel.administrativeArea.cadastralDistrict,
    parcel.administrativeArea.commune,
    parcel.administrativeArea.county,
  ].filter((value): value is string => value !== null);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Numer</dt>
      <dd className="min-w-0 font-semibold">{parcel.parcelNumber}</dd>
      <dt className="text-muted-foreground">Identyfikator</dt>
      <dd className="min-w-0 break-all font-medium">{parcel.identifier}</dd>
      <dt className="text-muted-foreground">Położenie</dt>
      <dd className="min-w-0">{location.length > 0 ? location.join(", ") : "Brak danych"}</dd>
      <dt className="text-muted-foreground">Źródło</dt>
      <dd className="min-w-0">
        {parcel.provenance.provider}
        {parcel.provenance.datasource ? ` · ${parcel.provenance.datasource}` : ""}
      </dd>
      <dt className="text-muted-foreground">Pobrano</dt>
      <dd className="min-w-0 tabular-nums">{formatRetrievedAt(parcel.provenance.retrievedAt)}</dd>
    </dl>
  );
}

export function MapWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setSearchParamsRef = useRef(setSearchParams);
  const urlValidation = validateWorkspaceSearchParams(
    searchParams,
    getAnalysisDateBounds(new Date()),
  );
  const initialIdentifier = urlValidation.parcelIdentifier;
  const validAnalysisSelection = getValidAnalysisSelection(
    searchParams,
    getAnalysisDateBounds(new Date()),
  );
  const reportRequested =
    urlValidation.issues.length === 0 &&
    initialIdentifier !== null &&
    searchParams.get("panel") === "report" &&
    validAnalysisSelection !== null;
  const parsedUrlMapView = urlValidation.mapView;
  const parsedInitialMapView = initialIdentifier === null ? parsedUrlMapView : null;
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap>(null);
  const topographicLayerRef = useRef<ReturnType<typeof createTopographicLayer>>(null);
  const orthophotoLayerRef = useRef<ReturnType<typeof createOrthophotoLayer>>(null);
  const parcelSourceRef = useRef<VectorSource>(null);
  const parcelLayerRef = useRef<VectorLayer<VectorSource>>(null);
  const parcelFeatureRef = useRef<Feature>(null);
  const fittedParcelIdentifierRef = useRef<string>(null);
  const initialMapViewRef = useRef(parsedInitialMapView);
  const reportViewRef = useRef(reportRequested);
  const canPersistMapViewRef = useRef(initialIdentifier === null);
  const isResettingMapViewRef = useRef(false);
  const interactiveBaseMapRef = useRef<BaseMap>("topographic");
  const [baseMap, setBaseMap] = useState<BaseMap>(reportRequested ? "orthophoto" : "topographic");
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapRetryAttempt, setMapRetryAttempt] = useState(0);
  const [suppressMapLoadingStatus, setSuppressMapLoadingStatus] = useState(false);
  const [mapSelectionEnabled, setMapSelectionEnabled] = useState(false);
  const [zoomAvailability, setZoomAvailability] = useState({ in: true, out: true });
  const [identifierInput, setIdentifierInput] = useState(initialIdentifier ?? "");
  const [lookup, setLookup] = useState<ParcelLookup | null>(
    initialIdentifier ? { type: "identifier", identifier: initialIdentifier } : null,
  );
  const [confirmedIdentifier, setConfirmedIdentifier] = useState<string | null>(initialIdentifier);

  const parcelQuery = useQuery({
    queryKey: ["parcel", lookup],
    queryFn: ({ signal }) => {
      if (!lookup) throw new Error("Parcel lookup is not set.");
      return getParcel(lookup, signal);
    },
    enabled: lookup !== null,
    retry: false,
    staleTime: 5 * 60 * 1_000,
  });
  const isConfirmed =
    parcelQuery.data !== undefined && parcelQuery.data.identifier === confirmedIdentifier;
  const showReport =
    reportRequested &&
    (isConfirmed ||
      (parcelQuery.isPending &&
        lookup?.type === "identifier" &&
        lookup.identifier === initialIdentifier));
  canPersistMapViewRef.current =
    urlValidation.issues.length === 0 && !showReport && searchParams.get("parcel") === null;

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  useEffect(() => {
    reportViewRef.current = showReport;
    for (const interaction of mapRef.current?.getInteractions().getArray() ?? []) {
      interaction.setActive(!showReport);
    }
  }, [showReport]);

  const removeParcelFromUrl = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("parcel");
        for (const parameter of ANALYSIS_SEARCH_PARAMETERS) next.delete(parameter);
        const mapView = mapRef.current ? getUrlView(mapRef.current.getView()) : null;
        if (mapView) setMapViewSearchParameters(next, mapView);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const beginLookup = useCallback(
    (nextLookup: ParcelLookup) => {
      setConfirmedIdentifier(null);
      fittedParcelIdentifierRef.current = null;
      removeParcelFromUrl();
      setLookup(nextLookup);
      const sameLookup =
        (lookup?.type === "identifier" &&
          nextLookup.type === "identifier" &&
          lookup.identifier === nextLookup.identifier) ||
        (lookup?.type === "point" &&
          nextLookup.type === "point" &&
          lookup.longitude === nextLookup.longitude &&
          lookup.latitude === nextLookup.latitude);
      if (sameLookup && !parcelQuery.isFetching) void parcelQuery.refetch();
    },
    [lookup, parcelQuery.isFetching, parcelQuery.refetch, removeParcelFromUrl],
  );
  const beginLookupRef = useRef(beginLookup);

  useEffect(() => {
    beginLookupRef.current = beginLookup;
  }, [beginLookup]);

  const fitPoland = useCallback((animated = false, onComplete?: (completed: boolean) => void) => {
    const map = mapRef.current;
    const mapElement = mapElementRef.current;

    if (!map || !mapElement) {
      onComplete?.(false);
      return;
    }

    const padding = getFitPadding(mapElement);
    const view = map.getView();
    const center = getCenter(POLAND_EXTENT);
    const resolution = getFitResolution(mapElement, padding);

    view.cancelAnimations();

    if (animated && !prefersReducedMotion()) {
      view.animate(
        {
          center,
          duration: FIT_POLAND_ANIMATION_DURATION_MS,
          easing: easeOut,
          resolution,
        },
        (completed) => onComplete?.(completed),
      );
      return;
    }

    view.setCenter(center);
    view.setResolution(resolution);
    onComplete?.(true);
  }, []);

  useLayoutEffect(() => {
    const mapElement = mapElementRef.current;
    if (!mapElement) return;

    const topographicLayer = createTopographicLayer();
    const orthophotoLayer = createOrthophotoLayer();
    topographicLayer.setVisible(!reportViewRef.current);
    orthophotoLayer.setVisible(reportViewRef.current);
    const parcelSource = new VectorSource();
    const parcelLayer = new VectorLayer({ source: parcelSource });
    const initialMapView = initialMapViewRef.current;
    const initialCenter = initialMapView
      ? transform(
          [initialMapView.longitude, initialMapView.latitude],
          "EPSG:4326",
          POLISH_PROJECTION_CODE,
        )
      : getCenter(POLAND_EXTENT);
    const view = new View({
      center: reportViewRef.current ? undefined : initialCenter,
      constrainOnlyCenter: true,
      constrainResolution: false,
      extent: MAP_VIEW_EXTENT,
      projection: POLISH_PROJECTION,
      resolutions: MAP_RESOLUTIONS,
      zoom: initialMapView?.zoom ?? 1,
    });

    const map = new OlMap({
      controls: [],
      interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false,
      }),
      layers: [topographicLayer, orthophotoLayer, parcelLayer],
      target: mapElement,
      view,
    });

    mapRef.current = map;
    fittedParcelIdentifierRef.current = null;
    topographicLayerRef.current = topographicLayer;
    orthophotoLayerRef.current = orthophotoLayer;
    parcelSourceRef.current = parcelSource;
    parcelLayerRef.current = parcelLayer;

    const updateZoomAvailability = () => {
      const zoom = view.getZoom() ?? 0;
      setZoomAvailability({
        in: zoom < MAP_RESOLUTIONS.length - 1,
        out: zoom > 0,
      });
      setMapSelectionEnabled(isParcelSelectionZoom(zoom));
    };

    const handleMapMoveEnd = () => {
      if (!canPersistMapViewRef.current || isResettingMapViewRef.current) return;

      const mapView = getUrlView(view);
      if (!mapView) return;

      setSearchParamsRef.current(
        (current) => {
          const next = new URLSearchParams(current);
          setMapViewSearchParameters(next, mapView);
          return next;
        },
        { replace: true },
      );
    };
    const isSelectableMapPosition = (coordinate: number[]) =>
      !reportViewRef.current && canSelectParcelAtMapPosition(view.getZoom(), coordinate);
    const handleMapClick = (event: { coordinate: number[] }) => {
      if (!isSelectableMapPosition(event.coordinate)) return;

      const coordinate = transform(event.coordinate, POLISH_PROJECTION_CODE, "EPSG:4326");
      const longitude = coordinate[0];
      const latitude = coordinate[1];
      if (longitude === undefined || latitude === undefined) return;

      beginLookupRef.current({ type: "point", longitude, latitude });
    };
    const handlePointerMove = (event: { coordinate: number[]; dragging: boolean }) => {
      if (reportViewRef.current) {
        mapElement.style.cursor = "default";
        return;
      }

      mapElement.style.cursor = event.dragging
        ? "grabbing"
        : isSelectableMapPosition(event.coordinate)
          ? "crosshair"
          : "grab";
    };

    view.on("change:resolution", updateZoomAvailability);
    map.on("singleclick", handleMapClick);
    map.on("pointermove", handlePointerMove);

    updateZoomAvailability();

    const animationFrame = window.requestAnimationFrame(() => {
      map.updateSize();
      if (!initialMapView && !reportViewRef.current && !fittedParcelIdentifierRef.current) {
        fitPoland();
      }
      map.on("moveend", handleMapMoveEnd);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      view.un("change:resolution", updateZoomAvailability);
      map.un("singleclick", handleMapClick);
      map.un("pointermove", handlePointerMove);
      map.un("moveend", handleMapMoveEnd);
      mapElement.style.cursor = "";
      map.setTarget(undefined);
      mapRef.current = null;
      topographicLayerRef.current = null;
      orthophotoLayerRef.current = null;
      parcelSourceRef.current = null;
      parcelLayerRef.current = null;
      parcelFeatureRef.current = null;
    };
  }, [fitPoland]);

  useEffect(() => {
    const map = mapRef.current;
    const topographicLayer = topographicLayerRef.current;
    const orthophotoLayer = orthophotoLayerRef.current;

    if (!map || !topographicLayer || !orthophotoLayer) return;

    const source =
      baseMap === "topographic" ? topographicLayer.getSource() : orthophotoLayer.getSource();
    if (!source) return;

    const failedTiles = new Set<string>();
    let timeout: number | undefined;
    const handleTimeout = () => {
      window.clearTimeout(timeout);
      timeout = undefined;
      setMapStatus("error");
    };
    const handleError = (event: TileSourceEvent) => {
      failedTiles.add(event.tile.getKey());
      handleTimeout();
    };
    const handleLoading = (event: TileSourceEvent) => {
      failedTiles.delete(event.tile.getKey());
      setMapStatus("loading");
      if (timeout === undefined) timeout = window.setTimeout(handleTimeout, 12_000);
    };
    const handleTileLoaded = (event: TileSourceEvent) => {
      failedTiles.delete(event.tile.getKey());
    };
    const handleComplete = (event: RenderEvent) => {
      window.clearTimeout(timeout);
      timeout = undefined;
      // A completed render can still contain failed tiles. Only failures required by this
      // frame should keep the warning visible; old viewports and recovered timeouts must not.
      const wantedTiles = event.frameState
        ? (event.frameState.wantedTiles[getUid(source)] ?? {})
        : undefined;
      const hasVisibleFailures = [...failedTiles].some(
        (key) => wantedTiles === undefined || wantedTiles[key],
      );
      setMapStatus(hasVisibleFailures ? "error" : "ready");
    };

    setMapStatus("loading");
    if (map.getView().getCenter()) timeout = window.setTimeout(handleTimeout, 12_000);
    source.on("tileloadstart", handleLoading);
    source.on("tileloaderror", handleError);
    source.on("tileloadend", handleTileLoaded);
    map.on("rendercomplete", handleComplete);
    topographicLayer.setVisible(baseMap === "topographic");
    orthophotoLayer.setVisible(baseMap === "orthophoto");
    if (mapRetryAttempt > 0) source.refresh();
    map.render();

    return () => {
      window.clearTimeout(timeout);
      source.un("tileloadstart", handleLoading);
      source.un("tileloaderror", handleError);
      source.un("tileloadend", handleTileLoaded);
      map.un("rendercomplete", handleComplete);
    };
  }, [baseMap, mapRetryAttempt]);

  useLayoutEffect(() => {
    const source = parcelSourceRef.current;
    if (!source) return;

    source.clear();
    parcelFeatureRef.current = null;

    if (lookup?.type === "point") {
      const coordinate = transform(
        [lookup.longitude, lookup.latitude],
        "EPSG:4326",
        POLISH_PROJECTION_CODE,
      );
      const point = new Feature({ geometry: new Point(coordinate) });
      point.setStyle(lookupPointStyle);
      source.addFeature(point);
    }
  }, [lookup]);

  useLayoutEffect(() => {
    const parcel = parcelQuery.data;
    const source = parcelSourceRef.current;
    const map = mapRef.current;
    const mapElement = mapElementRef.current;
    if (!parcel || !source || !map || !mapElement) return;

    source.clear();
    const geometry = new GeoJSON().readGeometry(parcel.geometry, {
      dataProjection: "EPSG:4326",
      featureProjection: POLISH_PROJECTION_CODE,
    });
    if (!geometry) return;

    const feature = new Feature({ geometry });
    feature.setStyle(
      parcel.identifier === confirmedIdentifier ? confirmedParcelStyle : candidateParcelStyle,
    );
    source.addFeature(feature);
    parcelFeatureRef.current = feature;

    const parcelGeometry = feature.getGeometry();
    if (parcelGeometry && fittedParcelIdentifierRef.current !== parcel.identifier) {
      map.updateSize();
      map.getView().fit(parcelGeometry.getExtent(), {
        duration: showReport || prefersReducedMotion() ? 0 : 420,
        maxZoom: showReport ? 15 : 11,
        padding: showReport ? [24, 24, 24, 24] : getParcelFitPadding(mapElement),
      });
      fittedParcelIdentifierRef.current = parcel.identifier;
    }
    if (showReport) map.renderSync();
  }, [confirmedIdentifier, parcelQuery.data, showReport]);

  const fitParcelForLayout = useCallback((reportMode: boolean, animated = true) => {
    const map = mapRef.current;
    const mapElement = mapElementRef.current;
    const parcelGeometry = parcelFeatureRef.current?.getGeometry();
    if (!map || !mapElement || !parcelGeometry) return;

    map.updateSize();
    map.getView().fit(parcelGeometry.getExtent(), {
      duration: animated && !prefersReducedMotion() ? 480 : 0,
      maxZoom: reportMode ? 15 : 11,
      padding: reportMode ? [24, 24, 24, 24] : getParcelFitPadding(mapElement),
    });
  }, []);

  const prepareMapSnapshot = useCallback(
    (reportMode: boolean, nextBaseMap: BaseMap) => {
      const map = mapRef.current;
      const mapElement = mapElementRef.current;
      const topographicLayer = topographicLayerRef.current;
      const orthophotoLayer = orthophotoLayerRef.current;
      const parcelLayer = parcelLayerRef.current;
      if (!map || !mapElement || !topographicLayer || !orthophotoLayer || !parcelLayer) return;

      topographicLayer.setVisible(nextBaseMap === "topographic");
      orthophotoLayer.setVisible(nextBaseMap === "orthophoto");
      parcelLayer.setVisible(true);
      map.getInteractions().forEach((interaction) => {
        interaction.setActive(!reportMode);
      });
      mapElement.style.cursor = reportMode ? "default" : "grab";
      fitParcelForLayout(reportMode, false);
      map.renderSync();
    },
    [fitParcelForLayout],
  );

  useLayoutEffect(() => {
    const map = mapRef.current;
    const mapElement = mapElementRef.current;
    const parcelLayer = parcelLayerRef.current;
    if (!map || !mapElement || !parcelLayer) return;

    map.getInteractions().forEach((interaction) => {
      interaction.setActive(!showReport);
    });
    parcelLayer.setVisible(true);
    mapElement.style.cursor = showReport ? "default" : "grab";

    if (!showReport && !map.getView().getCenter()) fitPoland();
    fitParcelForLayout(showReport, false);
    map.renderSync();
  }, [fitParcelForLayout, fitPoland, showReport]);

  useEffect(() => {
    if (showReport) setBaseMap("orthophoto");
  }, [showReport]);

  const changeZoom = (delta: number) => {
    const view = mapRef.current?.getView();
    const currentZoom = view?.getZoom();
    if (!view || currentZoom === undefined) return;

    view.animate({
      duration: prefersReducedMotion() ? 0 : 180,
      zoom: currentZoom + delta,
    });
  };

  const resetView = () => {
    isResettingMapViewRef.current = true;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        deleteMapViewSearchParameters(next);
        return next;
      },
      { replace: true },
    );
    fitPoland(true, (completed) => {
      isResettingMapViewRef.current = false;
      if (!completed) return;

      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          deleteMapViewSearchParameters(next);
          return next;
        },
        { replace: true },
      );
    });
  };

  const handleIdentifierSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = identifierInput.trim();
    if (!identifier) return;
    beginLookup({ type: "identifier", identifier });
  };

  const confirmParcel = () => {
    const parcel = parcelQuery.data;
    if (!parcel) return;

    setConfirmedIdentifier(parcel.identifier);
    setIdentifierInput(parcel.identifier);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("parcel", parcel.identifier);
        return next;
      },
      { replace: true },
    );
  };

  const clearParcel = () => {
    setLookup(null);
    setConfirmedIdentifier(null);
    fittedParcelIdentifierRef.current = null;
    setIdentifierInput("");
    removeParcelFromUrl();
    parcelSourceRef.current?.clear();
    parcelFeatureRef.current = null;
  };

  const openReport = () => {
    interactiveBaseMapRef.current = baseMap;
    if (mapStatus === "loading") {
      flushSync(() => setSuppressMapLoadingStatus(true));
    }

    void startWorkspaceTransition(
      () => {
        setBaseMap("orthophoto");
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            if (next.get("dateMode") !== "range") {
              next.set("dateMode", "day");
              if (!next.has("analysisDate")) {
                next.set("analysisDate", getAnalysisDateBounds(new Date()).max);
              }
            }
            next.set("panel", "report");
            return next;
          },
          { replace: true },
        );
      },
      () => prepareMapSnapshot(true, "orthophoto"),
    ).finally(() => setSuppressMapLoadingStatus(false));
  };

  const showFilters = () => {
    const nextBaseMap = interactiveBaseMapRef.current;
    void startWorkspaceTransition(
      () => {
        setBaseMap(nextBaseMap);
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.delete("panel");
            return next;
          },
          { replace: true },
        );
      },
      () => prepareMapSnapshot(false, nextBaseMap),
    ).then(() => document.getElementById("selection-panel-title")?.focus());
  };

  const lookupError = parcelQuery.error ? getParcelError(parcelQuery.error) : null;
  const visibleMapStatus =
    mapStatus === "error"
      ? mapStatus
      : mapStatus === "loading" && !showReport && !suppressMapLoadingStatus
        ? mapStatus
        : null;

  return (
    <main
      className="workspace relative min-h-dvh bg-white"
      data-testid="app-root"
      data-view={showReport ? "report" : "selection"}
    >
      <header className="workspace-header">
        <a aria-label="HydroPlon — strona główna" className="workspace-brand" href="/">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Droplets aria-hidden="true" className="size-6" strokeWidth={1.7} />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-tight">HydroPlon</span>
            <span className="block text-xs text-muted-foreground">Zatrzymaj wodę, chroń plony</span>
          </span>
        </a>
        <nav aria-label="Etapy analizy" className="workspace-progress">
          <ol className="flex items-center gap-4 text-sm">
            {["Działka", "Uprawa i termin", "Twój raport"].map((label, index) => {
              const currentStep = showReport ? 2 : isConfirmed ? 1 : 0;
              return (
                <li
                  aria-current={index === currentStep ? "step" : undefined}
                  className="flex items-center gap-4"
                  key={label}
                >
                  {index > 0 && (
                    <ChevronRight
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground/60"
                    />
                  )}
                  <span
                    className={
                      index <= currentStep
                        ? "flex items-center gap-2 font-medium text-primary"
                        : "flex items-center gap-2 text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        index === currentStep
                          ? "grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground"
                          : "grid size-6 place-items-center rounded-full bg-secondary text-xs"
                      }
                    >
                      {index < currentStep ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                aria-label="Jak korzystać z aplikacji"
                title="Pomoc"
                className="workspace-help grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
              >
                <HelpCircle aria-hidden="true" className="size-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-w-[calc(100vw-2rem)] text-sm leading-6">
              <h2 className="font-semibold">Od działki do wskazówek</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-4 text-muted-foreground">
                <li>Znajdź działkę na mapie lub podaj jej pełny identyfikator.</li>
                <li>Wybierz uprawę i dzień, który chcesz sprawdzić.</li>
                <li>
                  Przeczytaj ocenę i wskazówki. Źródła oraz obliczenia znajdziesz w szczegółach
                  raportu.
                </li>
              </ol>
              <p className="mt-3 border-t border-border pt-3 text-muted-foreground">
                Wynik opiera się na modelach i danych środowiskowych. Nie zastępuje sprawdzenia
                warunków na polu.
              </p>
            </PopoverContent>
          </Popover>
          <ReportPrintControls
            parcel={showReport ? (parcelQuery.data ?? null) : null}
            selection={
              showReport && validAnalysisSelection && parcelQuery.data
                ? { ...validAnalysisSelection, parcelIdentifier: parcelQuery.data.identifier }
                : null
            }
          />
        </div>
      </header>

      <section
        aria-labelledby={showReport ? "report-panel-title" : "selection-panel-title"}
        className="workspace-analysis-panel"
      >
        {urlValidation.issues.length > 0 && (
          <Alert aria-labelledby="invalid-link-title" className="mb-6" role="alert" lang="en">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>
              <h2 className="font-semibold" id="invalid-link-title">
                This link contains invalid settings
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {urlValidation.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              <p className="mt-2">Keep the valid settings and complete your selection below.</p>
              <Button
                className="mt-3 h-auto min-h-11 whitespace-normal"
                onClick={() => {
                  setSearchParams(urlValidation.repairedParams, { replace: true });
                  requestAnimationFrame(() =>
                    document.getElementById("selection-panel-title")?.focus(),
                  );
                }}
                type="button"
                variant="outline"
              >
                Remove invalid settings
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {showReport && parcelQuery.data ? (
          <ReportPanel onBack={showFilters} parcel={parcelQuery.data} />
        ) : showReport ? (
          <div aria-label="Ładowanie raportu działki" role="status">
            <h2 className="sr-only" id="report-panel-title">
              Raport działki
            </h2>
            <div className="h-7 w-48 animate-pulse rounded bg-secondary motion-reduce:animate-none" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-secondary motion-reduce:animate-none" />
            <div className="mt-5 h-20 animate-pulse rounded bg-secondary motion-reduce:animate-none" />
          </div>
        ) : (
          <div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                {isConfirmed ? (
                  <SlidersHorizontal aria-hidden="true" className="size-5" />
                ) : (
                  <MapPin aria-hidden="true" className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h1
                  id="selection-panel-title"
                  className="text-2xl font-semibold tracking-[-0.025em]"
                  tabIndex={-1}
                >
                  {isConfirmed ? "Co rośnie na działce?" : "Zacznij od swojej działki"}
                </h1>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {isConfirmed
                    ? "Wybierz uprawę i termin. Na tej podstawie ocenimy warunki wodne."
                    : "Sprawdź warunki wodne i dowiedz się, jak zatrzymać więcej wody na swoim polu."}
                </p>
              </div>
              {lookup && !isConfirmed && (
                <button
                  aria-label="Wyczyść wybraną działkę"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={clearParcel}
                  title="Wyczyść wybór"
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>

            {!isConfirmed ? (
              <>
                <div className="mt-7 flex items-start gap-3 border-y border-border py-4">
                  <MapIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Wskaż działkę na mapie</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {mapSelectionEnabled
                        ? "Kliknij wewnątrz swojego pola."
                        : "Przybliż mapę do swojej miejscowości, a potem kliknij wewnątrz pola."}
                    </p>
                  </div>
                </div>
                <form className="mt-5" onSubmit={handleIdentifierSubmit}>
                  <label className="text-sm font-medium" htmlFor="parcel-identifier">
                    Lub wpisz identyfikator działki
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      autoComplete="off"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
                      id="parcel-identifier"
                      aria-describedby="parcel-identifier-hint"
                      maxLength={80}
                      onChange={(event) => setIdentifierInput(event.target.value)}
                      placeholder="np. 141201_1.0001.6509"
                      required
                      type="text"
                      value={identifierInput}
                    />
                    <button
                      aria-label="Znajdź działkę"
                      className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                      disabled={parcelQuery.isFetching}
                      type="submit"
                    >
                      {parcelQuery.isFetching && lookup?.type === "identifier" ? (
                        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                      ) : (
                        <Search aria-hidden="true" className="size-5" />
                      )}
                    </button>
                  </div>
                  <details className="mt-2 text-xs leading-5 text-muted-foreground">
                    <summary className="min-h-8 cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Gdzie znaleźć identyfikator?
                    </summary>
                    <p className="mt-1" id="parcel-identifier-hint">
                      Pełny identyfikator znajdziesz w Geoportalu lub dokumentach ewidencji gruntów.
                      Zawiera oznaczenie gminy, obrębu i numer działki, np. 141201_1.0001.6509.
                    </p>
                  </details>
                </form>

                <div aria-live="polite" className="mt-4">
                  {parcelQuery.isFetching && (
                    <div className="flex items-center justify-center gap-3 rounded-lg bg-secondary px-3 py-3 text-sm">
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-5 shrink-0 animate-spin text-primary"
                      />
                      <span className="sr-only">Szukamy granic Twojej działki…</span>
                    </div>
                  )}

                  {!parcelQuery.isFetching && lookupError && (
                    <div
                      className="rounded-lg bg-destructive/10 p-3 text-sm text-foreground"
                      role="alert"
                    >
                      <div className="flex gap-2.5">
                        <AlertTriangle
                          aria-hidden="true"
                          className="mt-0.5 size-5 shrink-0 text-destructive"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold">{lookupError.title}</p>
                          <p className="mt-1 leading-5 text-muted-foreground">
                            {lookupError.message}
                          </p>
                        </div>
                      </div>
                      <button
                        className="mt-3 min-h-10 rounded-lg bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => void parcelQuery.refetch()}
                        type="button"
                      >
                        Spróbuj ponownie
                      </button>
                    </div>
                  )}

                  {!parcelQuery.isFetching && parcelQuery.data && (
                    <div className="rounded-lg bg-secondary/70 p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-full bg-amber-100 text-amber-800">
                          <MapPin aria-hidden="true" className="size-4" />
                        </span>
                        <p className="font-semibold">Sprawdź znalezioną działkę</p>
                      </div>
                      <ParcelDetails parcel={parcelQuery.data} />
                      <button
                        className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={confirmParcel}
                        type="button"
                      >
                        Potwierdź tę działkę
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              parcelQuery.data && (
                <>
                  <div className="mt-5 flex items-center gap-3 rounded-lg bg-secondary/70 p-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        Działka {parcelQuery.data.parcelNumber}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {parcelQuery.data.identifier}
                      </p>
                    </div>
                    <button
                      className="min-h-9 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={clearParcel}
                      type="button"
                    >
                      Zmień
                    </button>
                  </div>
                  <AnalysisSetupForm
                    hasInvalidLinkSettings={urlValidation.issues.length > 0}
                    onContinue={openReport}
                    parcel={parcelQuery.data}
                  />
                </>
              )
            )}
          </div>
        )}
      </section>

      <p className="sr-only" id="map-instructions">
        {showReport
          ? "Statyczny podgląd położenia działki. Granica działki jest widoczna nad ortofotomapą."
          : "Mapę można przesuwać kursorem oraz przybliżać kółkiem myszy, klawiaturą lub przyciskami. Po odpowiednim przybliżeniu kliknij wewnątrz działki, aby ją rozpoznać."}
      </p>
      <section
        aria-label={
          showReport
            ? `Podgląd ortofotomapy działki ${parcelQuery.data?.parcelNumber ?? ""}`
            : undefined
        }
        className="workspace-map-shell"
      >
        <div
          aria-describedby="map-instructions"
          aria-label={
            showReport
              ? "Podgląd położenia i granicy działki"
              : "Interaktywna mapa wyboru działki w Polsce"
          }
          className={`workspace-map-canvas outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring${showReport && !parcelQuery.data ? " invisible" : ""}`}
          ref={mapElementRef}
          role="region"
          tabIndex={showReport ? -1 : 0}
        />

        {showReport && !parcelQuery.data && (
          <div className="absolute inset-0 grid place-items-center bg-secondary">
            <Spinner label="Ładowanie podglądu działki" />
          </div>
        )}

        {!showReport && (
          <div className="workspace-map-toolbar absolute inset-x-4 top-4 z-10 flex items-start justify-end gap-2">
            <fieldset className="m-0 flex min-w-0 rounded-xl border-0 bg-background/95 p-1 shadow-sm">
              <legend className="sr-only">Wybierz podkład mapy</legend>
              <button
                aria-pressed={baseMap === "topographic"}
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground sm:px-3.5"
                data-active={baseMap === "topographic"}
                onClick={() => setBaseMap("topographic")}
                type="button"
              >
                <MapIcon aria-hidden="true" className="size-4" />
                <span>Mapa</span>
              </button>
              <button
                aria-pressed={baseMap === "orthophoto"}
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground sm:px-3.5"
                data-active={baseMap === "orthophoto"}
                onClick={() => setBaseMap("orthophoto")}
                type="button"
              >
                <ImageIcon aria-hidden="true" className="size-4" />
                <span className="hidden min-[390px]:inline">Zdjęcie lotnicze</span>
                <span className="min-[390px]:hidden">Zdjęcie</span>
              </button>
            </fieldset>

            <button
              aria-label="Cała Polska"
              className="flex min-h-12 items-center gap-2 rounded-xl bg-background/95 px-3 text-sm font-medium shadow-sm transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
              onClick={resetView}
              title="Pokaż całą Polskę"
              type="button"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span className="hidden lg:inline">Cała Polska</span>
            </button>
          </div>
        )}
        <div className="workspace-map-controls absolute right-4 top-20 z-10 flex flex-col overflow-hidden rounded-xl bg-background/95 shadow-sm">
          <button
            aria-label="Przybliż mapę"
            className="grid size-11 place-items-center transition-colors duration-150 hover:bg-secondary focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!zoomAvailability.in}
            onClick={() => changeZoom(1)}
            title="Przybliż"
            type="button"
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
          <span aria-hidden="true" className="mx-2 h-px bg-border" />
          <button
            aria-label="Oddal mapę"
            className="grid size-11 place-items-center transition-colors duration-150 hover:bg-secondary focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!zoomAvailability.out}
            onClick={() => changeZoom(-1)}
            title="Oddal"
            type="button"
          >
            <Minus aria-hidden="true" className="size-5" />
          </button>
        </div>

        {visibleMapStatus === "loading" && (
          <div
            aria-live="polite"
            className="workspace-map-status rounded-xl bg-background px-4 py-3"
          >
            <Spinner label="Ładowanie podkładu mapy…" />
          </div>
        )}
        {visibleMapStatus === "error" && (
          <Alert
            aria-label="Problem z podkładem mapy"
            aria-live="polite"
            className="workspace-map-status"
            role="status"
            variant="warning"
          >
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>
              <p className="text-base font-medium leading-6">
                Nie udało się wczytać części podkładu.
              </p>
              <p className="mt-1">Spróbuj ponownie lub wyszukaj działkę po identyfikatorze.</p>
              <RetryButton
                className="mt-3 bg-background text-foreground"
                isRetrying={false}
                onRetry={() => setMapRetryAttempt((attempt) => attempt + 1)}
              >
                Ponów ładowanie mapy
              </RetryButton>
            </AlertDescription>
          </Alert>
        )}

        <aside className="workspace-map-attribution rounded-md bg-background/90 px-2 py-1 text-right text-[11px] leading-4 text-muted-foreground backdrop-blur-sm">
          <a
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="https://www.geoportal.gov.pl/pl/usluga/uslugi-przegladania-wms-i-wmts/"
            rel="noreferrer"
            target="_blank"
          >
            Źródło: GUGiK
          </a>
          <span> · {SOURCE_DETAILS[baseMap]}</span>
        </aside>
      </section>

      {showReport && parcelQuery.data && <ReportResultsSection parcel={parcelQuery.data} />}
    </main>
  );
}
