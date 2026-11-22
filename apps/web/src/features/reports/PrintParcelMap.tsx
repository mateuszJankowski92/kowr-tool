import type { ParcelResponse, RecommendationItem } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import type { HydrologyData } from "../terrain-context/hydrology-map-features";
import { getPrintMapBackground } from "./print-map-background";
import { createPrintMapLayout, PRINT_MAP_SIZE } from "./print-map-geometry";

export function PrintParcelMap({
  parcel,
  locations = [],
  hydrology = null,
}: {
  parcel: ParcelResponse;
  locations?: RecommendationItem["locations"];
  hydrology?: HydrologyData | null;
}) {
  const clipId = useId();
  const layout = createPrintMapLayout({ parcel, locations, hydrology });
  const background = useQuery({
    queryKey: ["print-map-background", layout.backgroundExtent],
    queryFn: ({ signal }) => getPrintMapBackground(layout.backgroundExtent, signal),
    retry: false,
    staleTime: 30 * 60 * 1_000,
  });
  const [width, height] = PRINT_MAP_SIZE;
  return (
    <figure className="print-parcel-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Mapa działki, obiektów wodnych i miejsc do oględzin"
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={width} height={height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {background.data && (
            <image
              href={background.data.imageDataUrl}
              width={width}
              height={height}
              preserveAspectRatio="none"
            />
          )}
          <path d={layout.parcelPath} className="print-map-parcel-halo" fillRule="evenodd" />
          <path d={layout.parcelPath} className="print-map-parcel" fillRule="evenodd" />
          {[...layout.water, ...layout.inspections].map((feature) => (
            <path
              key={feature.key}
              d={feature.path}
              className="print-map-water"
              data-polygon={feature.polygon || undefined}
              fillRule="evenodd"
            />
          ))}
          {layout.markers.map(({ key, number, label, anchor, position }) => (
            <g key={key}>
              <title>{label}</title>
              <line
                x1={anchor[0]}
                y1={anchor[1]}
                x2={position[0]}
                y2={position[1]}
                className="print-map-connector"
              />
              <circle cx={position[0]} cy={position[1]} r="13" className="print-map-marker" />
              <text
                x={position[0]}
                y={(position[1] ?? 0) + 4}
                textAnchor="middle"
                className="print-map-number"
              >
                {number}
              </text>
            </g>
          ))}
        </g>
        <text x={width - 22} y="18" textAnchor="middle">
          N ↑
        </text>
      </svg>
      <figcaption>
        Granica działki{layout.water.length > 0 ? " i oznaczone obiekty wodne" : ""}.
        {layout.water.length > 0
          ? " Numery obiektów wodnych odpowiadają liście wody w otoczeniu."
          : ""}
        {locations.length > 0
          ? " Numery miejsc do oględzin odpowiadają wskazaniom przy zaleceniach."
          : ""}{" "}
        {background.data
          ? ` Podkład: GUGiK — Ortofotomapa standardowa, pobrano ${background.data.retrievedAt} (UTC). Data wykonania zdjęć nie jest udostępniona; także dla dat historycznych użyto bieżącego podkładu. Bezpłatne wykorzystanie na podstawie Prawa geodezyjnego i kartograficznego.`
          : background.isPending
            ? " Przygotowujemy ortofotomapę…"
            : " Ortofotomapa GUGiK jest niedostępna. Pokazujemy granice i obiekty z pobranych danych."}{" "}
        Miejsca do oględzin wymagają weryfikacji w terenie.
      </figcaption>
    </figure>
  );
}
