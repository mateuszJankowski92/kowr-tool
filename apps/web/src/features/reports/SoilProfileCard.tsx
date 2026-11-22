import type { SoilProfileResponse } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Database, Layers3 } from "lucide-react";
import { useId } from "react";
import { getSoilProfile } from "../../api/soil-profiles";
import { RetryButton } from "../../components/RetryButton";
import { Badge } from "../../components/ui/badge";
import { ReportSectionHeader } from "./ReportSectionHeader";

type SoilLayer = SoilProfileResponse["layers"][number];

const RETENTION_SCALE = {
  minimum: 0,
  maximum: 40,
  light: "#e9f5f7",
  dark: "#0b527c",
} as const;

const COMPARISON_THRESHOLD_PERCENTAGE_POINTS = 3;
const MINIMUM_LAYER_DISPLAY_HEIGHT = 30;
const SCALE_COLOR = "var(--muted-foreground)";

function hexToRgb(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mixColor(start: string, end: string, position: number): string {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  return rgbToHex(
    from[0] + (to[0] - from[0]) * position,
    from[1] + (to[1] - from[1]) * position,
    from[2] + (to[2] - from[2]) * position,
  );
}

export function retentionColorForValue(value: number): string {
  const position = Math.min(
    1,
    Math.max(
      0,
      (value - RETENTION_SCALE.minimum) / (RETENTION_SCALE.maximum - RETENTION_SCALE.minimum),
    ),
  );
  return mixColor(RETENTION_SCALE.light, RETENTION_SCALE.dark, position);
}

function darken(color: string): string {
  const [red, green, blue] = hexToRgb(color);
  return rgbToHex(red * 0.74, green * 0.74, blue * 0.74);
}

function retentionValue(layer: SoilLayer): number | null {
  return layer.availableWaterCapacity.using33Kpa?.volumetricPercent ?? null;
}

function weightedAverage(layers: readonly SoilLayer[]): number | null {
  const values = layers.flatMap((layer) => {
    const value = retentionValue(layer);
    if (value === null) return [];
    const thicknessCm = layer.bottomDepthCm - layer.topDepthCm;
    return [{ value, thicknessCm }];
  });
  if (values.length === 0) return null;

  const totalThickness = values.reduce((sum, entry) => sum + entry.thicknessCm, 0);
  return values.reduce((sum, entry) => sum + entry.value * entry.thicknessCm, 0) / totalThickness;
}

export function describeRetentionProfile(layers: SoilProfileResponse["layers"]): string {
  const availableValues = layers.flatMap((layer) => {
    const value = retentionValue(layer);
    return value === null ? [] : [value];
  });
  if (availableValues.length < 4) {
    return "Dostępne dane nie pozwalają wiarygodnie porównać zdolności zatrzymywania wody między głębokościami.";
  }

  const spread = Math.max(...availableValues) - Math.min(...availableValues);
  if (spread < COMPARISON_THRESHOLD_PERCENTAGE_POINTS) {
    return "Zdolność zatrzymywania wody jest podobna na większości analizowanych głębokości.";
  }

  const upperAverage = weightedAverage(layers.filter((layer) => layer.bottomDepthCm <= 30));
  const deeperAverage = weightedAverage(layers.filter((layer) => layer.topDepthCm >= 30));
  if (upperAverage === null || deeperAverage === null) {
    return "Zdolność zatrzymywania wody różni się między warstwami, ale brakuje danych do porównania górnej i głębszej części profilu.";
  }

  const difference = upperAverage - deeperAverage;
  if (difference >= COMPARISON_THRESHOLD_PERCENTAGE_POINTS) {
    return "Górne warstwy tej gleby mają większą modelowaną zdolność zatrzymywania wody niż warstwy głębsze.";
  }
  if (difference <= -COMPARISON_THRESHOLD_PERCENTAGE_POINTS) {
    return "Górne warstwy tej gleby mają mniejszą modelowaną zdolność zatrzymywania wody niż warstwy głębsze.";
  }

  return "Zdolność zatrzymywania wody zmienia się między warstwami, ale nie tworzy wyraźnego podziału na górną i głębszą część profilu.";
}

function depthLabel(layer: SoilLayer): string {
  return `${layer.topDepthCm}–${layer.bottomDepthCm} cm`;
}

function formatRetentionValue(value: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value);
}

function createDisplayLayerLayout(
  layers: SoilProfileResponse["layers"],
  topY: number,
  profileHeight: number,
) {
  const thicknesses = layers.map((layer) => layer.bottomDepthCm - layer.topDepthCm);
  const totalThickness = thicknesses.reduce((sum, thickness) => sum + thickness, 0);
  const minimumHeight = Math.min(MINIMUM_LAYER_DISPLAY_HEIGHT, profileHeight / layers.length);
  const proportionalHeight = profileHeight - minimumHeight * layers.length;
  let currentY = topY;

  return layers.map((layer, index) => {
    const thickness = layer.bottomDepthCm - layer.topDepthCm;
    const thicknessShare = totalThickness > 0 ? thickness / totalThickness : 1 / layers.length;
    const y1 = currentY;
    const y2 =
      index === layers.length - 1
        ? topY + profileHeight
        : y1 + minimumHeight + proportionalHeight * thicknessShare;
    currentY = y2;

    return { layer, y1, y2 };
  });
}

function SoilBlock({ layers }: { layers: SoilProfileResponse["layers"] }) {
  const id = useId().replaceAll(":", "");
  const patternId = `${id}-missing`;
  const depthArrowId = `${id}-depth-arrow`;
  const valueArrowId = `${id}-value-arrow`;
  const grassClipId = `${id}-grass-clip`;
  const topY = 96;
  const profileHeight = 320;
  const displayLayers = createDisplayLayerLayout(layers, topY, profileHeight);
  const depthPositions = new Map<number, number>();
  for (const { layer, y1, y2 } of displayLayers) {
    depthPositions.set(layer.topDepthCm, y1);
    depthPositions.set(layer.bottomDepthCm, y2);
  }
  const depthToY = (depthCm: number) =>
    depthPositions.get(depthCm) ?? topY + (depthCm / 200) * profileHeight;
  const depthTicks = [0, 5, 15, 30, 60, 100, 200];

  return (
    <svg
      aria-label="Modelowana zdolność gleby do zatrzymywania wody od 0 do 200 centymetrów"
      className="h-auto w-full text-foreground"
      role="img"
      viewBox="-57 38 730 404"
    >
      <defs>
        <clipPath id={grassClipId}>
          <path d="M150 96L222 56H466L394 96Z" />
        </clipPath>
        <pattern height="8" id={patternId} patternUnits="userSpaceOnUse" width="8">
          <rect fill="var(--muted)" height="8" width="8" />
          <path d="M-2 2L2-2M0 8L8 0M6 10L10 6" stroke="var(--muted-foreground)" strokeWidth="1" />
        </pattern>
        <marker
          id={depthArrowId}
          markerHeight="7"
          markerUnits="strokeWidth"
          markerWidth="7"
          orient="auto"
          refX="6"
          refY="3.5"
        >
          <path d="M0 0L7 3.5L0 7Z" fill={SCALE_COLOR} />
        </marker>
        <marker
          id={valueArrowId}
          markerHeight="7"
          markerUnits="strokeWidth"
          markerWidth="7"
          orient="auto"
          refX="6"
          refY="3.5"
        >
          <path d="M0 0L7 3.5L0 7Z" fill={SCALE_COLOR} />
        </marker>
      </defs>

      {displayLayers.map(({ layer, y1, y2 }) => {
        const value = retentionValue(layer);
        const color = value === null ? null : retentionColorForValue(value);
        const frontFill = color ?? `url(#${patternId})`;
        const sideFill = color ? darken(color) : `url(#${patternId})`;

        return (
          <g key={`${layer.topDepthCm}-${layer.bottomDepthCm}`}>
            <title>
              {value === null
                ? `${depthLabel(layer)}: brak danych retencyjnych`
                : `${depthLabel(layer)}: ${formatRetentionValue(value)} l potencjalnie dostępnej wody na 100 l gleby`}
            </title>
            <rect
              data-retention-face="front"
              data-soil-depth={`${layer.topDepthCm}-${layer.bottomDepthCm}`}
              fill={frontFill}
              height={y2 - y1}
              width="244"
              x="150"
              y={y1}
            />
            <path
              data-retention-face="side"
              d={`M394 ${y1}L466 ${y1 - 40}V${y2 - 40}L394 ${y2}Z`}
              fill={sideFill}
            />
          </g>
        );
      })}

      {displayLayers.slice(0, -1).map(({ layer, y2 }) => (
        <path
          data-soil-layer-separator={layer.bottomDepthCm}
          d={`M150 ${y2}H394L466 ${y2 - 40}`}
          fill="none"
          key={`separator-${layer.bottomDepthCm}`}
          stroke="var(--background)"
          strokeLinecap="butt"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      ))}

      <path
        clipPath={`url(#${grassClipId})`}
        d="M150 96L222 56H466L394 96Z"
        fill="#86a36d"
        stroke="#526641"
        strokeLinejoin="bevel"
        strokeWidth="3"
      />

      <text
        fill={SCALE_COLOR}
        fontSize="10"
        fontWeight="700"
        letterSpacing="0.5"
        textAnchor="middle"
        x="100"
        y="72"
      >
        Głębokość
      </text>
      <line
        data-depth-axis="true"
        stroke={SCALE_COLOR}
        strokeWidth="1"
        x1="118"
        x2="118"
        y1={depthToY(0)}
        y2={depthToY(200)}
      />
      {depthTicks.map((depth) => {
        const y = depthToY(depth);
        return (
          <g key={`depth-${depth}`}>
            <text
              fill={SCALE_COLOR}
              fontSize="11"
              fontWeight="600"
              textAnchor="end"
              x="102"
              y={y + 4}
            >
              {depth} cm
            </text>
            <line
              data-depth-scale-tick={depth}
              markerEnd={`url(#${depthArrowId})`}
              stroke={SCALE_COLOR}
              strokeWidth="1"
              x1="118"
              x2="146"
              y1={y}
              y2={y}
            />
          </g>
        );
      })}

      {displayLayers.map(({ layer, y1, y2 }) => {
        const targetY = (y1 + y2) / 2 - 40;
        const value = retentionValue(layer);
        return (
          <g key={`value-${layer.topDepthCm}-${layer.bottomDepthCm}`}>
            <line
              data-retention-arrow={`${layer.topDepthCm}-${layer.bottomDepthCm}`}
              markerEnd={`url(#${valueArrowId})`}
              stroke={SCALE_COLOR}
              strokeLinecap="round"
              strokeWidth="1"
              x1="498"
              x2="470"
              y1={targetY}
              y2={targetY}
            />
            <text fill={SCALE_COLOR} fontSize="11" fontWeight="600" x="514" y={targetY + 4}>
              {value === null ? "Brak danych" : `${formatRetentionValue(value)} l`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RetentionLegend({ hasMissingData }: { hasMissingData: boolean }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        aria-label="Od mniejszej do większej zdolności zatrzymywania wody"
        className="h-3 rounded-full"
        role="img"
        style={{
          background: `linear-gradient(to right, ${RETENTION_SCALE.light}, ${RETENTION_SCALE.dark})`,
        }}
      />
      <div className="mt-2 flex items-start justify-between gap-4 text-xs font-medium leading-4 text-muted-foreground">
        <span>Mniejsza zdolność zatrzymywania wody</span>
        <span className="text-right">Większa zdolność zatrzymywania wody</span>
      </div>
      {hasMissingData && (
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden="true" className="size-3 rounded-sm border border-border bg-muted" />
          Szary wzór oznacza brak danych dla warstwy.
        </p>
      )}
    </div>
  );
}

function formatRetrievedAt(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(new Date(value));
}

function SoilDataSourceDetails({ profile }: { profile: SoilProfileResponse }) {
  return (
    <div className="source-details">
      <dl className="source-facts">
        <div>
          <dt className="text-muted-foreground">Zbiór danych</dt>
          <dd className="mt-0.5 font-medium">{profile.provenance.dataset}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dostawca</dt>
          <dd className="mt-0.5 font-medium">{profile.provenance.provider}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Licencja</dt>
          <dd className="mt-0.5 font-medium">{profile.provenance.license}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pobrano</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {formatRetrievedAt(profile.provenance.retrievedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rozdzielczość nominalna</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {profile.provenance.resolutionMeters} m
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Wynik i niepewność modelu</dt>
          <dd className="mt-0.5 font-medium">
            Mediana {profile.provenance.predictionStatistic} · zakres{" "}
            {profile.provenance.uncertaintyInterval}
          </dd>
        </div>
      </dl>
      <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        Właściwości gleby oszacowano dla jednej reprezentatywnej komórki modelu. To nie jest pomiar
        terenowy ani informacja o aktualnej wilgotności gleby. Kolory pokazują modelowaną zdolność
        zatrzymywania wody.
      </p>
    </div>
  );
}

export function SoilProfileCard({ profile }: { profile: SoilProfileResponse }) {
  const hasMissingData = profile.layers.some((layer) => retentionValue(layer) === null);
  const conclusion = describeRetentionProfile(profile.layers);

  return (
    <article
      aria-labelledby="soil-profile-title"
      className="overflow-hidden rounded-2xl bg-background shadow-[0_18px_44px_rgb(15_37_25_/_12%)]"
    >
      <div className="px-5 pt-5 md:px-6 md:pt-6">
        <ReportSectionHeader
          description="Modelowana zdolność gleby do zatrzymywania wody dostępnej dla roślin."
          icon={Layers3}
          id="soil-profile-title"
          source={{
            content: <SoilDataSourceDetails profile={profile} />,
            description:
              "Pochodzenie, dokładność i ograniczenia modelu gleby wykorzystanego w tej sekcji.",
            title: "Źródło danych glebowych",
          }}
          status={
            profile.status !== "complete" ? (
              <Badge variant={profile.status === "partial" ? "warning" : "neutral"}>
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                {profile.status === "partial" ? "Dane częściowe" : "Brak danych"}
              </Badge>
            ) : undefined
          }
          title="Gleba i zatrzymywanie wody"
        />
      </div>

      <div className="mt-5 bg-secondary/65 px-2 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-3xl">
          <SoilBlock layers={profile.layers} />
          <p className="mt-3 text-center text-xs font-medium leading-5 text-muted-foreground">
            Wartości pokazują litry potencjalnie dostępnej wody w 100 l gleby.
          </p>
        </div>
      </div>

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <RetentionLegend hasMissingData={hasMissingData} />

        <p className="mx-auto mt-7 max-w-[58ch] text-center text-base font-semibold leading-7 sm:text-lg">
          {conclusion}
        </p>

        <section
          aria-label="Źródło i jakość danych glebowych"
          className="mx-auto mt-5 hidden max-w-[72ch] border-t border-border pt-4 text-left print:block"
        >
          <h3 className="mb-3 text-sm font-semibold">Źródło i jakość danych</h3>
          <SoilDataSourceDetails profile={profile} />
        </section>
      </div>
    </article>
  );
}

function SoilProfileLoading() {
  return (
    <div
      aria-label="Pobieranie właściwości zatrzymywania wody przez glebę"
      className="rounded-2xl bg-background p-6 shadow-[0_18px_44px_rgb(15_37_25_/_12%)] sm:p-8"
      role="status"
    >
      <div className="mx-auto h-7 w-64 max-w-full animate-pulse rounded bg-secondary" />
      <div className="mx-auto mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-secondary" />
      <div className="mx-auto mt-7 aspect-[6/5] max-w-3xl animate-pulse rounded-xl bg-secondary" />
      <div className="mx-auto mt-6 h-3 max-w-2xl animate-pulse rounded-full bg-secondary" />
    </div>
  );
}

export function SoilProfileSection({ parcelIdentifier }: { parcelIdentifier: string }) {
  const profileQuery = useQuery({
    queryKey: ["soil-profile", parcelIdentifier],
    queryFn: ({ signal }) => getSoilProfile(parcelIdentifier, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (profileQuery.isPending) return <SoilProfileLoading />;

  if (profileQuery.isError) {
    return (
      <div className="rounded-2xl bg-background p-5 shadow-[0_18px_44px_rgb(15_37_25_/_12%)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-destructive">
            <Database aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Dane gleby są chwilowo niedostępne</h2>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">
              Nie otrzymaliśmy poprawnego wyniku dla profilu gleby. Pozostałe informacje o działce
              pozostają dostępne.
            </p>
            <RetryButton
              className="mt-3"
              isRetrying={profileQuery.isFetching}
              onRetry={() => void profileQuery.refetch()}
            >
              Spróbuj ponownie
            </RetryButton>
          </div>
        </div>
      </div>
    );
  }

  return <SoilProfileCard profile={profileQuery.data} />;
}
