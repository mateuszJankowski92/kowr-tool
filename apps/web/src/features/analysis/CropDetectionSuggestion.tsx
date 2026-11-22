import type { Crop, ParcelResponse } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleCheck, CircleHelp, ScanSearch } from "lucide-react";
import { useEffect, useRef } from "react";
import { getCropDetection } from "../../api/crop-detections";
import { RetryButton } from "../../components/RetryButton";

type CropDetectionSuggestionProps = {
  currentCrop: Crop | "";
  onSuggestion: (crop: Crop) => void;
  parcel: Pick<ParcelResponse, "geometry" | "identifier">;
};

function formatPercent(value: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value);
}

export function CropDetectionSuggestion({
  currentCrop,
  onSuggestion,
  parcel,
}: CropDetectionSuggestionProps) {
  const appliedSuggestionRef = useRef<Crop | null>(null);
  const query = useQuery({
    queryKey: ["crop-detection", parcel.identifier],
    queryFn: ({ signal }) => getCropDetection(parcel, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const primaryCandidate = query.data?.candidates[0];

  useEffect(() => {
    if (
      currentCrop ||
      query.data?.status !== "suggested" ||
      !primaryCandidate ||
      appliedSuggestionRef.current === primaryCandidate.crop
    ) {
      return;
    }

    appliedSuggestionRef.current = primaryCandidate.crop;
    onSuggestion(primaryCandidate.crop);
  }, [currentCrop, onSuggestion, primaryCandidate, query.data?.status]);

  if (query.isPending) {
    return (
      <div
        aria-label="Sprawdzam deklarację uprawy ARiMR"
        className="mt-2.5 rounded-lg bg-secondary px-3 py-2.5"
        role="status"
      >
        <div className="h-3 w-36 animate-pulse rounded bg-muted-foreground/20" />
        <div className="mt-2 h-3 w-52 max-w-full animate-pulse rounded bg-muted-foreground/15" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        className="mt-2.5 flex gap-2.5 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs leading-4"
        role="status"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p>Nie udało się sprawdzić deklaracji ARiMR. Wybierz uprawę ręcznie.</p>
          <RetryButton
            className="mt-2"
            isRetrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        </div>
      </div>
    );
  }

  if (query.data.status === "not_found") {
    return (
      <div
        className="mt-2.5 flex gap-2.5 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-4"
        role="status"
      >
        <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p>Brak deklaracji ARiMR GSA 2025 przecinającej tę działkę. Wybierz uprawę ręcznie.</p>
      </div>
    );
  }

  if (query.data.status === "multiple") {
    const visibleCandidates = query.data.candidates.slice(0, 3);
    const remainingCount = query.data.candidates.length - visibleCandidates.length;

    return (
      <div className="mt-2.5 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-4" role="status">
        <div className="flex gap-2.5">
          <ScanSearch aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              {query.data.complete && query.data.candidates.length > 1
                ? "Kilka upraw w granicach działki"
                : "Wynik wymaga ręcznego wyboru"}
            </p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground">
              {visibleCandidates.map((candidate) => (
                <li className="flex justify-between gap-3" key={candidate.crop}>
                  <span className="truncate">{candidate.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatPercent(candidate.overlapPercent)}%
                  </span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="mt-1 text-muted-foreground">oraz {remainingCount} więcej</p>
            )}
            <p className="mt-1.5 text-muted-foreground">
              {query.data.complete
                ? "Wybierz właściwą uprawę ręcznie."
                : "Wynik jest niepełny; wybierz właściwą uprawę ręcznie."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!primaryCandidate) return null;

  const differsFromManualSelection = currentCrop && currentCrop !== primaryCandidate.crop;

  return (
    <div
      className="mt-2.5 flex gap-2.5 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-4"
      role="status"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-semibold text-foreground">
          {differsFromManualSelection ? "Deklaracja ARiMR" : "Uzupełniono z deklaracji ARiMR"}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {primaryCandidate.label} · {formatPercent(primaryCandidate.overlapPercent)}% powierzchni
          działki
        </p>
        <p className="mt-1 text-muted-foreground">
          {differsFromManualSelection
            ? "Pozostawiono Twój wybór. Deklaracja nie potwierdza faktycznie rosnącej rośliny."
            : "Możesz zmienić wybór. Deklaracja nie potwierdza faktycznie rosnącej rośliny."}
        </p>
      </div>
    </div>
  );
}
