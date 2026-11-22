import type { SatelliteVegetationHistoryPoint } from "@kowr/contracts";
import {
  type ChartData,
  Chart as ChartJS,
  type ChartOptions,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Info } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { Line } from "react-chartjs-2";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { parseLocalDate } from "../analysis/analysis-date";

ChartJS.register(LinearScale, LineElement, PointElement, Tooltip);

const MAX_CONNECTED_GAP_DAYS = 14;
const DAY_MS = 86_400_000;
const NDMI_CHART_GUIDE =
  "Każdy punkt to użyteczna obserwacja działki. NDMI ma skalę od −1 do 1, bez jednostki: wartość 0,5 nie oznacza 50% wilgotności. Pokrycie danymi mówi, jaką część działki można było przeanalizować, a nie jak pewny jest wynik.";
const ndmiFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 3,
  minimumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });

type VegetationChartPoint = {
  date: string;
  quality: SatelliteVegetationHistoryPoint["quality"]["assessment"];
  validPixelPercent: number;
  x: number;
  y: number;
};

function dateTimestamp(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function formatDate(value: string, pattern = "d MMM yyyy"): string {
  return format(parseLocalDate(value), pattern, { locale: pl });
}

function qualityLabel(quality: VegetationChartPoint["quality"]): string {
  if (quality === "sufficient") return "wystarczająca";
  if (quality === "limited") return "ograniczona";
  return "niewystarczająca";
}

export function splitVegetationHistory(
  history: SatelliteVegetationHistoryPoint[],
  maxGapDays = MAX_CONNECTED_GAP_DAYS,
): SatelliteVegetationHistoryPoint[][] {
  const chronological = [...history].sort((left, right) => left.date.localeCompare(right.date));
  const segments: SatelliteVegetationHistoryPoint[][] = [];

  for (const observation of chronological) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (
      !current ||
      !previous ||
      (dateTimestamp(observation.date) - dateTimestamp(previous.date)) / DAY_MS > maxGapDays
    ) {
      segments.push([observation]);
    } else {
      current.push(observation);
    }
  }

  return segments;
}

function chartPoint(observation: SatelliteVegetationHistoryPoint): VegetationChartPoint {
  return {
    date: observation.date,
    quality: observation.quality.assessment,
    validPixelPercent: observation.validPixelPercent,
    x: dateTimestamp(observation.date),
    y: observation.ndmi,
  };
}

type VegetationHistoryChartProps = {
  fromDate: string;
  history: SatelliteVegetationHistoryPoint[];
  toDate: string;
};

export function VegetationHistoryChart({ fromDate, history, toDate }: VegetationHistoryChartProps) {
  const segments = splitVegetationHistory(history);
  const chartData: ChartData<"line", VegetationChartPoint[]> = {
    datasets: segments.map((segment) => ({
      label: "Wskaźnik uwodnienia roślinności (NDMI)",
      data: segment.map(chartPoint),
      borderColor: "rgb(31, 91, 61)",
      borderWidth: 2,
      pointBackgroundColor: "rgb(31, 91, 61)",
      pointBorderColor: "rgb(248, 250, 247)",
      pointBorderWidth: 2,
      pointHoverRadius: 5,
      pointRadius: 3.5,
      tension: 0,
    })),
  };
  const options: ChartOptions<"line"> = {
    animation: false,
    maintainAspectRatio: false,
    normalized: true,
    parsing: false,
    responsive: true,
    interaction: { intersect: false, mode: "nearest" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgb(26, 64, 45)",
        bodySpacing: 5,
        callbacks: {
          afterLabel: (context) => {
            const point = context.raw as VegetationChartPoint;
            return [
              `Jakość: ${qualityLabel(point.quality)}`,
              `Użyteczne dane dla ${percentFormatter.format(point.validPixelPercent)}% analizowanej powierzchni`,
            ];
          },
          label: (context) =>
            context.parsed.y === null
              ? "NDMI: brak danych"
              : `NDMI: ${ndmiFormatter.format(context.parsed.y)}`,
          title: (items) => {
            const point = items[0]?.raw as VegetationChartPoint | undefined;
            return point ? formatDate(point.date) : "";
          },
        },
        cornerRadius: 8,
        displayColors: false,
        padding: 10,
        titleSpacing: 6,
      },
    },
    scales: {
      x: {
        type: "linear",
        min: dateTimestamp(fromDate),
        max: dateTimestamp(toDate),
        grid: { color: "rgba(48, 79, 59, 0.08)" },
        ticks: {
          autoSkip: true,
          callback: (value) => format(new Date(Number(value)), "d MMM", { locale: pl }),
          maxRotation: 0,
          maxTicksLimit: 6,
        },
      },
      y: {
        title: { display: true, text: "NDMI" },
        grid: { color: "rgba(48, 79, 59, 0.1)" },
        ticks: {
          callback: (value) => ndmiFormatter.format(Number(value)),
          maxTicksLimit: 5,
        },
      },
    },
  };

  return (
    <figure
      aria-describedby="vegetation-history-description"
      aria-labelledby="vegetation-history-title"
      className="mt-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-1">
          <h3 className="font-semibold" id="vegetation-history-title">
            Wskaźnik uwodnienia roślinności (NDMI)
          </h3>
          {history.length > 0 && (
            <TooltipPrimitive.Provider delayDuration={200}>
              <TooltipPrimitive.Root>
                <TooltipPrimitive.Trigger asChild>
                  <Button
                    aria-label="Jak odczytywać wykres NDMI"
                    className="size-11 text-muted-foreground print:hidden"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Info aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipPrimitive.Trigger>
                <TooltipPrimitive.Portal>
                  <TooltipPrimitive.Content
                    className="z-50 max-w-xs rounded-lg bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-md ring-1 ring-foreground/10"
                    collisionPadding={12}
                    sideOffset={6}
                  >
                    {NDMI_CHART_GUIDE}
                  </TooltipPrimitive.Content>
                </TooltipPrimitive.Portal>
              </TooltipPrimitive.Root>
            </TooltipPrimitive.Provider>
          )}
        </div>
        <Badge className="tabular-nums" variant="neutral">
          {formatDate(fromDate)} – {formatDate(toDate)}
        </Badge>
      </div>
      <Alert className="mt-3" id="vegetation-history-description">
        <Info aria-hidden="true" />
        <AlertDescription>
          Wyższa wartość może wskazywać na więcej wody w roślinności. Zmiany trzeba odczytywać razem
          z fazą rozwoju roślin i pogodą. To nie jest pomiar wilgotności gleby ani potwierdzenie, że
          uprawa jest w dobrej kondycji.
        </AlertDescription>
      </Alert>

      {history.length === 0 ? (
        <div className="mt-4 rounded-xl bg-secondary px-4 py-4 text-sm leading-6 text-muted-foreground">
          Brak użytecznych obserwacji do pokazania na wykresie NDMI.
        </div>
      ) : (
        <>
          <div
            aria-describedby="vegetation-history-description vegetation-history-scale"
            aria-label={`Wykres NDMI: ${history.length} użytecznych obserwacji satelitarnych`}
            className="satellite-history-chart mt-4"
            role="img"
          >
            <Line data={chartData} options={options} />
          </div>
          <ul className="sr-only">
            {history.map((observation) => (
              <li key={observation.date}>
                {formatDate(observation.date)}: NDMI {ndmiFormatter.format(observation.ndmi)},
                jakość {qualityLabel(observation.quality.assessment)}, dane dla{" "}
                {percentFormatter.format(observation.validPixelPercent)}% analizowanej powierzchni
                działki
              </li>
            ))}
          </ul>
          {history.length < 4 && (
            <p className="mt-3 text-sm leading-5 text-muted-foreground">
              Dostępne punkty pokazują pojedyncze obserwacje, ale nie pozwalają wiarygodnie określić
              kierunku zmian.
            </p>
          )}
          {segments.length > 1 && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Linia jest przerwana tam, gdzie między użytecznymi obserwacjami minęło ponad 14 dni.
            </p>
          )}
          <figcaption
            className="sr-only print:not-sr-only print:mt-2 print:text-xs"
            id="vegetation-history-scale"
          >
            {NDMI_CHART_GUIDE}
          </figcaption>
        </>
      )}
    </figure>
  );
}
