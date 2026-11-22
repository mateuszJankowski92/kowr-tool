// biome-ignore-all lint/a11y/noNoninteractiveTabindex: OpenLayers needs a focusable map target.
import type { ParcelResponse, RecommendationItem } from "@kowr/contracts";
import { Expand, LoaderCircle, MapPin, Minus, Navigation2, Plus, RotateCcw } from "lucide-react";
import { asArray } from "ol/color.js";
import Attribution from "ol/control/Attribution.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { buffer, getCenter } from "ol/extent.js";
import GeoJSON from "ol/format/GeoJSON.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import OlMap from "ol/Map.js";
import VectorSource from "ol/source/Vector.js";
import { Circle, Fill, Stroke, Style, Text } from "ol/style.js";
import View from "ol/View.js";
import { useEffect, useRef, useState } from "react";
import "ol/ol.css";
import { Button } from "../../components/ui/button";
import { createOrthophotoLayer, POLISH_PROJECTION } from "../map/map-config";
import { layoutHydrologyMarkers } from "../terrain-context/hydrology-marker-layout";

type Props = {
  parcel: ParcelResponse;
  locations: RecommendationItem["locations"];
  selection?: { key: string } | null;
};

export function RetentionLocationsMap({ parcel, locations, selection = null }: Props) {
  const selectedLocationKey = selection?.key ?? null;
  const targetRef = useRef<HTMLElement>(null);
  const [imageryStatus, setImageryStatus] = useState<"loading" | "ready" | "error">("loading");
  const retryRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const zoomRef = useRef<((delta: number) => void) | null>(null);
  const selectionRef = useRef(selectedLocationKey);
  const selectRef = useRef<((key: string | null) => void) | null>(null);
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const format = new GeoJSON({
      dataProjection: "EPSG:4326",
      featureProjection: POLISH_PROJECTION,
    });
    const features = format.readFeatures({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { parcel: true }, geometry: parcel.geometry },
        ...locations.map((location, index) => ({
          type: "Feature",
          properties: { number: index + 1, locationKey: `${location.kind}:${location.id}` },
          geometry: location.geometry,
        })),
      ],
    });
    const parcelExtent = features[0]?.getGeometry()?.getExtent();
    if (!parcelExtent) return;
    const source = new VectorSource({ features });
    const tokens = getComputedStyle(target);
    const primary = tokens.getPropertyValue("--primary").trim();
    const foreground = tokens.getPropertyValue("--primary-foreground").trim();
    const [red = 36, green = 100, blue = 72] = asArray(primary);
    const base = createOrthophotoLayer();
    base.setVisible(true);
    const imagery = base.getSource();
    let failed = false;
    let timeout: number;
    const startLoading = () => {
      window.clearTimeout(timeout);
      failed = false;
      setImageryStatus("loading");
      timeout = window.setTimeout(() => setImageryStatus("error"), 12_000);
    };
    const onLoad = () => {
      window.clearTimeout(timeout);
      if (!failed) setImageryStatus("ready");
    };
    const onError = () => {
      window.clearTimeout(timeout);
      failed = true;
      setImageryStatus("error");
    };
    startLoading();
    imagery?.on("tileloadend", onLoad);
    imagery?.on("tileloaderror", onError);
    retryRef.current = () => {
      startLoading();
      imagery?.refresh();
    };
    const center = getCenter(parcelExtent);
    const anchors = features
      .slice(1)
      .map((feature) => feature.getGeometry()?.getClosestPoint(center));
    const parcelStyles = [
      new Style({ stroke: new Stroke({ color: foreground, width: 6 }) }),
      new Style({
        stroke: new Stroke({ color: primary, width: 2.5 }),
        fill: new Fill({ color: [red, green, blue, 0.12] }),
      }),
    ];
    const vectorLayer = new VectorLayer({
      source,
      style: (feature) => {
        if (feature.get("parcel")) return parcelStyles;
        const selected = feature.get("locationKey") === selectionRef.current;
        const index = Number(feature.get("number")) - 1;
        const anchor = anchors[index];
        if (!anchor) return [];
        const size = map.getSize();
        const pixels = anchors.map((coordinate) =>
          coordinate ? map.getPixelFromCoordinate(coordinate) : null,
        );
        const positions =
          size && pixels.every((pixel) => pixel !== null)
            ? layoutHydrologyMarkers(
                pixels.map((pixel) => [pixel?.[0] ?? 0, pixel?.[1] ?? 0]),
                size,
              )
            : [];
        const pixel = positions[index];
        const position = pixel ? map.getCoordinateFromPixel(pixel) : anchor;
        const connector = new LineString([anchor, position]);
        return [
          new Style({
            stroke: new Stroke({ color: foreground, width: 6 }),
            image: new Circle({ radius: 5, fill: new Fill({ color: foreground }) }),
            zIndex: 1,
          }),
          new Style({
            stroke: new Stroke({ color: primary, width: 3 }),
            fill: new Fill({ color: [red, green, blue, 0.18] }),
            image: new Circle({ radius: 3, fill: new Fill({ color: primary }) }),
            zIndex: 2,
          }),
          // Move only the label; the source geometry and connector keep its location explicit.
          new Style({
            geometry: connector,
            stroke: new Stroke({ color: foreground, width: 5 }),
            zIndex: 3,
          }),
          new Style({
            geometry: connector,
            stroke: new Stroke({ color: primary, width: 1.5 }),
            zIndex: 4,
          }),
          new Style({
            geometry: new Point(position),
            image: new Circle({
              radius: selected ? 16 : 15,
              fill: new Fill({ color: primary }),
              stroke: new Stroke({ color: foreground, width: selected ? 4 : 3 }),
            }),
            text: new Text({
              text: String(feature.get("number")),
              fill: new Fill({ color: foreground }),
              font: "600 13px 'Segoe UI', sans-serif",
            }),
            zIndex: selected ? 6 : 5,
          }),
        ];
      },
    });
    const map: OlMap = new OlMap({
      target,
      controls: [new Attribution({ collapsible: false }), new ScaleLine({ units: "metric" })],
      layers: [base, vectorLayer],
      view: new View({
        projection: POLISH_PROJECTION,
        minZoom: 5,
        maxZoom: 21,
        enableRotation: false,
      }),
    });
    map.on("moveend", () => vectorLayer.changed());
    const fitMap = () => {
      map.updateSize();
      const extent = source.getExtent();
      if (extent) map.getView().fit(extent, { padding: [55, 76, 55, 55], maxZoom: 18 });
    };
    fitRef.current = fitMap;
    zoomRef.current = (delta) => {
      const view = map.getView();
      view.setZoom((view.getZoom() ?? 18) + delta);
    };
    fitMap();
    selectRef.current = (key) => {
      selectionRef.current = key;
      vectorLayer.changed();
      const selected = features.find((feature) => feature.get("locationKey") === key);
      const extent = selected?.getGeometry()?.getExtent();
      if (extent) {
        const location = locations.find((entry) => `${entry.kind}:${entry.id}` === key);
        // Keep enough surrounding ground visible; a point extent alone zooms down to centimetres.
        const contextMeters = Math.max(30, (location?.resolutionMeters ?? 0) * 3);
        map.updateSize();
        map.getView().fit(buffer(extent, contextMeters), {
          padding: [55, 76, 55, 55],
          maxZoom: 18,
        });
      }
    };
    selectRef.current(selectionRef.current);
    const observer = new ResizeObserver(() => {
      if (selectionRef.current) selectRef.current?.(selectionRef.current);
      else fitMap();
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      imagery?.un("tileloadend", onLoad);
      imagery?.un("tileloaderror", onError);
      retryRef.current = null;
      fitRef.current = null;
      zoomRef.current = null;
      selectRef.current = null;
      map.setTarget(undefined);
      map.dispose();
    };
  }, [locations, parcel]);
  useEffect(() => {
    selectionRef.current = selection?.key ?? null;
    selectRef.current?.(selection?.key ?? null);
  }, [selection]);
  return (
    <div className="retention-map mt-3 overflow-hidden rounded-2xl border border-border">
      {selectedLocationKey &&
        locations.some((entry) => `${entry.kind}:${entry.id}` === selectedLocationKey) && (
          <p className="border-b border-border bg-background px-4 py-3 text-sm" role="status">
            Wybrane miejsce:{" "}
            {locations.findIndex((entry) => `${entry.kind}:${entry.id}` === selectedLocationKey) +
              1}
            . Powiększony znacznik wskazuje miejsce do sprawdzenia w terenie.
          </p>
        )}
      <div className="relative">
        <section
          aria-label="Mapa działki i ponumerowanych miejsc do oględzin"
          className="retention-map-canvas h-80 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-96"
          ref={targetRef}
          tabIndex={0}
        />
        <div
          aria-label="Północ"
          className="pointer-events-none absolute left-4 top-4 flex flex-col items-center gap-0.5 rounded-lg bg-background px-2.5 py-2 text-primary shadow-sm"
          role="img"
        >
          <span className="text-[10px] font-semibold leading-none">N</span>
          <Navigation2 aria-hidden="true" className="size-4" />
        </div>
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <div className="flex flex-col overflow-hidden rounded-lg bg-background shadow-sm">
            <Button
              aria-label="Przybliż mapę"
              className="size-11 rounded-none"
              onClick={() => zoomRef.current?.(1)}
              title="Przybliż mapę"
              variant="ghost"
            >
              <Plus aria-hidden="true" />
            </Button>
            <Button
              aria-label="Oddal mapę"
              className="size-11 rounded-none border-t border-border"
              onClick={() => zoomRef.current?.(-1)}
              title="Oddal mapę"
              variant="ghost"
            >
              <Minus aria-hidden="true" />
            </Button>
          </div>
          <Button
            aria-label="Pokaż całą działkę i miejsca"
            className="size-11 bg-background shadow-sm"
            onClick={() => fitRef.current?.()}
            title="Pokaż całą działkę i miejsca"
            variant="ghost"
          >
            <Expand aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-background px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-4 rounded-xs border-2 border-primary bg-primary/10"
          />
          Granica działki
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-4 text-primary" />
          {locations.length > 0 ? "Miejsca do oględzin" : "Brak miejsc do oględzin"}
        </span>
      </div>
      {imageryStatus !== "ready" && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted px-4 py-2 text-xs leading-5 text-muted-foreground"
          role="status"
        >
          {imageryStatus === "loading" ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
              <span className="sr-only">Pobieranie ortofotomapy…</span>
            </span>
          ) : (
            <>
              <span className="min-w-0 flex-1 basis-56">
                Ortofotomapa jest niedostępna. Granica i miejsca pochodzą z pobranych danych.
              </span>
              <Button
                className="min-h-11 gap-2 text-xs"
                onClick={() => retryRef.current?.()}
                variant="ghost"
              >
                <RotateCcw aria-hidden="true" />
                Ponów podkład
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
