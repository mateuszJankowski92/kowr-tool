// biome-ignore-all lint/a11y/noNoninteractiveTabindex: OpenLayers needs a focusable map target for keyboard navigation.
// biome-ignore-all lint/a11y/useSemanticElements: OpenLayers requires a generic target element.
import type { ParcelResponse } from "@kowr/contracts";
import type { Coordinate } from "ol/coordinate.js";
import { getCenter } from "ol/extent.js";
import Geometry from "ol/geom/Geometry.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import OlMap from "ol/Map.js";
import VectorSource from "ol/source/Vector.js";
import { Circle, Fill, Stroke, Style, Text } from "ol/style.js";
import View from "ol/View.js";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "../../components/ui/spinner";
import "ol/ol.css";
import { Button } from "../../components/ui/button";
import { createOrthophotoLayer, POLISH_PROJECTION } from "../map/map-config";
import { createHydrologyMapFeatures, type HydrologyData } from "./hydrology-map-features";
import { HYDROLOGY_MARKER_RADIUS, layoutHydrologyMarkers } from "./hydrology-marker-layout";

type Props = {
  parcel: ParcelResponse;
  hydrology: HydrologyData;
  selectedId: string | null;
  highlightedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
};

const parcelStyle = new Style({
  stroke: new Stroke({ color: "#2563eb", width: 3 }),
  fill: new Fill({ color: "rgba(37,99,235,0.15)" }),
});

export function HydrologyMap({
  parcel,
  hydrology,
  selectedId,
  highlightedId,
  onSelect,
  onHover,
}: Props) {
  const targetRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selectedId);
  const highlightRef = useRef(highlightedId);
  const onHoverRef = useRef(onHover);
  const refreshHighlightRef = useRef<(() => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  const updateRef = useRef<((id: string | null) => void) | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const [baseStatus, setBaseStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
  }, [onSelect, onHover]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const { parcelFeature, waterFeatures, searchExtent, fitExtent } = createHydrologyMapFeatures(
      parcel,
      hydrology,
    );
    const baseLayer = createOrthophotoLayer();
    baseLayer.setVisible(true);
    const source = baseLayer.getSource();
    let failed = false;
    let loaded = false;
    let timeout: number;
    const startLoading = () => {
      window.clearTimeout(timeout);
      loaded = false;
      failed = false;
      setBaseStatus("loading");
      timeout = window.setTimeout(() => {
        if (!loaded) setBaseStatus("error");
      }, 12_000);
    };
    startLoading();
    source?.on("tileloadend", () => {
      loaded = true;
      if (!failed) setBaseStatus("ready");
    });
    source?.on("tileloaderror", () => {
      failed = true;
      setBaseStatus("error");
    });
    retryRef.current = () => {
      startLoading();
      source?.refresh();
    };
    const center = getCenter(parcelFeature.getGeometry()?.getExtent() ?? searchExtent);
    const markerAnchors = waterFeatures.map((feature) =>
      feature.getGeometry()?.getClosestPoint(center),
    );
    const markerPosition = (index: number): Coordinate | undefined => {
      const anchors = markerAnchors.map((anchor) =>
        anchor ? map.getPixelFromCoordinate(anchor) : null,
      );
      const size = map.getSize();
      if (!size || anchors.some((anchor) => !anchor)) return markerAnchors[index];
      const positions = layoutHydrologyMarkers(
        anchors.map((anchor) => [anchor?.[0] ?? 0, anchor?.[1] ?? 0]),
        size,
      );
      const position = positions[index];
      return position ? map.getCoordinateFromPixel(position) : markerAnchors[index];
    };
    const waterLayer = new VectorLayer({
      extent: searchExtent,
      source: new VectorSource({
        features: waterFeatures,
        attributions: "© OpenStreetMap contributors · ODbL",
      }),
      style: (feature) => {
        const selected =
          feature.getId() === selectionRef.current || feature.getId() === highlightRef.current;
        const color = selected ? "#92400e" : "#075985";
        const geometry = feature.getGeometry();
        if (!(geometry instanceof Geometry)) return [];
        const index = Number(feature.get("number")) - 1;
        const anchor = markerAnchors[index];
        const position = markerPosition(index) ?? anchor;
        if (!anchor || !position) return [];
        return [
          new Style({ stroke: new Stroke({ color: "#ffffff", width: selected ? 9 : 7 }) }),
          new Style({
            stroke: new Stroke({ color, width: selected ? 5 : 3 }),
            fill: new Fill({ color: selected ? "rgba(180,83,9,0.3)" : "rgba(14,165,233,0.25)" }),
          }),
          // Leader lines preserve the source location when nearby labels need to move apart.
          new Style({
            geometry: new LineString([anchor, position]),
            stroke: new Stroke({ color: "#ffffff", width: 4 }),
            zIndex: 1,
          }),
          new Style({
            geometry: new LineString([anchor, position]),
            stroke: new Stroke({ color, width: 2 }),
            zIndex: 1,
          }),
          new Style({
            geometry: new Point(position),
            image: new Circle({
              radius: selected ? HYDROLOGY_MARKER_RADIUS : 13,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: "#ffffff", width: 2 }),
            }),
            text: new Text({
              text: String(feature.get("number")),
              font: "600 13px sans-serif",
              fill: new Fill({ color: "#ffffff" }),
            }),
            zIndex: selected ? 3 : 2,
          }),
        ];
      },
    });
    const map = new OlMap({
      target,
      controls: [],
      layers: [
        baseLayer,
        waterLayer,
        new VectorLayer({
          source: new VectorSource({ features: [parcelFeature] }),
          style: parcelStyle,
        }),
      ],
      view: new View({ projection: POLISH_PROJECTION, center, zoom: 12, minZoom: 5, maxZoom: 20 }),
    });
    map.on("moveend", () => waterLayer.changed());
    const fitObjects = (id: string | null) => {
      map.updateSize();
      map.getView().fit(fitExtent(id), { padding: [48, 40, 48, 40], maxZoom: 18 });
    };
    updateRef.current = (id) => {
      waterLayer.changed();
      fitObjects(id);
    };
    refreshHighlightRef.current = () => waterLayer.changed();
    const clearHover = () => {
      target.removeAttribute("data-water-hovered");
      onHoverRef.current(null);
    };
    map.on("pointermove", (event) => {
      if (event.dragging) {
        clearHover();
        return;
      }
      const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => layer === waterLayer,
        hitTolerance: 8,
      });
      target.toggleAttribute("data-water-hovered", Boolean(feature));
      onHoverRef.current(feature ? String(feature.getId()) : null);
    });
    target.addEventListener("pointerleave", clearHover);
    map.on("singleclick", (event) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => layer === waterLayer,
        hitTolerance: 8,
      });
      onSelectRef.current(feature ? String(feature.getId()) : null);
    });
    const resizeObserver = new ResizeObserver(() => fitObjects(selectionRef.current));
    resizeObserver.observe(target);
    fitObjects(selectionRef.current);
    return () => {
      window.clearTimeout(timeout);
      target.removeEventListener("pointerleave", clearHover);
      clearHover();
      refreshHighlightRef.current = null;
      resizeObserver.disconnect();
      updateRef.current = null;
      retryRef.current = null;
      map.setTarget(undefined);
      map.dispose();
    };
  }, [parcel, hydrology]);

  useEffect(() => {
    selectionRef.current = selectedId;
    updateRef.current?.(selectedId);
  }, [selectedId]);

  useEffect(() => {
    highlightRef.current = highlightedId;
    refreshHighlightRef.current?.();
  }, [highlightedId]);

  return (
    <div className="hydrology-map-shell">
      <div
        aria-label="Mapa działki i pobliskich obiektów wodnych. Wybierz ponumerowany obiekt z listy poniżej."
        className="hydrology-map-canvas"
        ref={targetRef}
        role="region"
        tabIndex={0}
      />
      {baseStatus !== "ready" && (
        <div className="hydrology-map-status" role={baseStatus === "error" ? "status" : undefined}>
          {baseStatus === "loading" ? (
            <Spinner label="Pobieranie ortofotomapy…" />
          ) : (
            "Ortofotomapa jest niedostępna. Granice działki i obiekty wodne pozostają widoczne."
          )}
          {baseStatus === "error" && (
            <Button onClick={() => retryRef.current?.()} size="sm" variant="outline">
              Ponów pobieranie zdjęcia
            </Button>
          )}
        </div>
      )}
      <div className="hydrology-map-legend">
        <span>
          <i className="hydrology-parcel-key" />
          Działka
        </span>
        <span>
          <i className="hydrology-water-key" />
          Obiekty wodne · numery zgodne z listą
        </span>
      </div>
    </div>
  );
}
