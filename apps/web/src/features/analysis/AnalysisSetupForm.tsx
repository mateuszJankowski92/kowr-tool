import { type Crop, CropSchema, type ParcelResponse } from "@kowr/contracts";
import { format } from "date-fns";
import { pl as dateFnsPl } from "date-fns/locale";
import { ArrowRight, CalendarDays, Info } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { pl as dayPickerPl } from "react-day-picker/locale";
import { useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  type AnalysisDateBounds,
  formatLocalDate,
  getAnalysisDateBounds,
  parseLocalDate,
  validateAnalysisDay,
  validateAnalysisRange,
} from "./analysis-date";
import { CropCombobox } from "./CropCombobox";
import { CropDetectionSuggestion } from "./CropDetectionSuggestion";

type AnalysisDateMode = "day" | "range";

type SelectionState = {
  crop: Crop | "";
  day: string;
  endDate: string;
  mode: AnalysisDateMode;
  startDate: string;
};

function parseCrop(value: string | null): Crop | "" {
  const result = CropSchema.safeParse(value);
  return result.success ? result.data : "";
}

function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(parseLocalDate(value));
}

function getSelection(searchParams: URLSearchParams, bounds: AnalysisDateBounds): SelectionState {
  const mode = searchParams.get("dateMode") === "range" ? "range" : "day";
  const day = searchParams.get("analysisDate") ?? bounds.max;
  const startDate = searchParams.get("dateFrom") ?? day;
  const endDate = searchParams.get("dateTo") ?? day;

  return {
    crop: parseCrop(searchParams.get("crop")),
    day,
    endDate,
    mode,
    startDate,
  };
}

type AnalysisSetupFormProps = {
  hasInvalidLinkSettings?: boolean;
  onContinue: () => void;
  parcel?: ParcelResponse;
  today?: Date;
};

export function AnalysisSetupForm({
  hasInvalidLinkSettings = false,
  onContinue,
  parcel,
  today,
}: AnalysisSetupFormProps) {
  const [referenceDate] = useState(() => today ?? new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [pendingRangeStart, setPendingRangeStart] = useState<Date | null>(null);
  const bounds = getAnalysisDateBounds(referenceDate);
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = getSelection(searchParams, bounds);
  const validation =
    selection.mode === "day"
      ? validateAnalysisDay(selection.day, bounds)
      : validateAnalysisRange(selection.startDate, selection.endDate, bounds);
  const analysisEndDate = selection.mode === "range" ? selection.endDate : selection.day;
  const isReady = !hasInvalidLinkSettings && selection.crop !== "" && validation.valid;
  const selectedStartDate = validation.valid
    ? parseLocalDate(selection.mode === "range" ? selection.startDate : selection.day)
    : undefined;
  const selectedEndDate =
    selection.mode === "range" && validation.valid ? parseLocalDate(selection.endDate) : undefined;
  const selectedRange: DateRange = pendingRangeStart
    ? { from: pendingRangeStart, to: undefined }
    : selection.mode === "range"
      ? { from: selectedStartDate, to: selectedEndDate }
      : { from: selectedStartDate, to: undefined };
  const dateLabel = !selectedStartDate
    ? "Wybierz datę w kalendarzu"
    : selection.mode === "range"
      ? `${format(selectedStartDate, "d MMM yyyy", { locale: dateFnsPl })} – ${format(
          selectedEndDate ?? selectedStartDate,
          "d MMM yyyy",
          { locale: dateFnsPl },
        )}`
      : format(selectedStartDate, "d MMMM yyyy", { locale: dateFnsPl });
  const persistSelection = (nextSelection: SelectionState) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("dateMode", nextSelection.mode);

        if (nextSelection.crop) next.set("crop", nextSelection.crop);
        else next.delete("crop");

        if (nextSelection.mode === "day") {
          next.set("analysisDate", nextSelection.day);
          next.delete("dateFrom");
          next.delete("dateTo");
        } else {
          next.set("dateFrom", nextSelection.startDate);
          next.set("dateTo", nextSelection.endDate);
          next.delete("analysisDate");
        }

        return next;
      },
      { replace: true },
    );
  };

  const selectCalendarDay = (date: Date) => {
    if (pendingRangeStart) {
      const [rangeStart, rangeEnd] =
        pendingRangeStart <= date ? [pendingRangeStart, date] : [date, pendingRangeStart];
      const startDate = formatLocalDate(rangeStart);
      const endDate = formatLocalDate(rangeEnd);

      if (startDate === endDate) {
        persistSelection({ ...selection, mode: "day", day: startDate });
      } else {
        persistSelection({
          ...selection,
          mode: "range",
          startDate,
          endDate,
        });
      }

      setPendingRangeStart(null);
      setIsCalendarOpen(false);
      return;
    }

    const day = formatLocalDate(date);
    setPendingRangeStart(date);
    persistSelection({
      ...selection,
      mode: "day",
      day,
    });
  };

  const changeCalendarVisibility = (open: boolean) => {
    setIsCalendarOpen(open);
    if (open) setPendingRangeStart(null);
  };

  return (
    <div className="mt-6 border-t border-border pt-6">
      <div>
        <label className="text-sm font-medium" htmlFor="analysis-crop">
          Uprawa
        </label>
        <CropCombobox
          describedBy="analysis-crop-source"
          id="analysis-crop"
          onValueChange={(crop) =>
            persistSelection({
              ...selection,
              crop,
            })
          }
          value={selection.crop}
        />
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground" id="analysis-crop-source">
          Wybierz uprawę z analizowanego sezonu.
        </p>
        {parcel && (
          <CropDetectionSuggestion
            currentCrop={selection.crop}
            onSuggestion={(crop) => persistSelection({ ...selection, crop })}
            parcel={parcel}
          />
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium" id="analysis-date-label">
          Dzień lub zakres dat
        </p>
        <Popover onOpenChange={changeCalendarVisibility} open={isCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-describedby={
                validation.valid ? "analysis-date-hint" : "analysis-date-hint analysis-date-error"
              }
              aria-invalid={!validation.valid}
              aria-labelledby="analysis-date-label analysis-date-value"
              className="mt-1.5 min-h-11 w-full justify-between px-3 text-left text-sm font-medium shadow-sm"
              variant="outline"
            >
              <span className="min-w-0 truncate tabular-nums" id="analysis-date-value">
                {dateLabel}
              </span>
              <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
            <Calendar
              captionLayout="dropdown"
              className="[--cell-size:--spacing(9)]"
              defaultMonth={selectedRange.from ?? parseLocalDate(bounds.max)}
              disabled={{
                before: parseLocalDate(bounds.min),
                after: parseLocalDate(bounds.max),
              }}
              endMonth={parseLocalDate(bounds.max)}
              locale={dayPickerPl}
              mode="range"
              onDayClick={selectCalendarDay}
              selected={selectedRange}
              startMonth={parseLocalDate(bounds.min)}
            />
            <p className="border-t border-border px-3 py-2 text-xs leading-4 text-muted-foreground">
              Kliknij raz, aby wybrać dzień. Kliknij drugą datę, aby utworzyć zakres.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      <p className="mt-2 text-xs leading-4 text-muted-foreground" id="analysis-date-hint">
        Dostępny okres: {formatDisplayDate(bounds.min)}–{formatDisplayDate(bounds.max)}. Zakres
        obejmuje obie daty graniczne.
      </p>

      {analysisEndDate === bounds.max && (
        <Alert className="mt-2" role="status">
          <Info aria-hidden="true" />
          <AlertDescription>
            Dzisiejsza doba jeszcze trwa. Raport pokaże braki danych dobowych i rzeczywistą datę
            ostatnich dostępnych informacji.
          </AlertDescription>
        </Alert>
      )}

      {!validation.valid && (
        <p
          className="mt-2 text-sm font-medium text-destructive"
          id="analysis-date-error"
          role="alert"
        >
          {validation.message}
        </p>
      )}

      <Button
        aria-describedby={hasInvalidLinkSettings ? "invalid-link-title" : undefined}
        className="mt-5 min-h-11 w-full gap-2 text-sm font-semibold"
        disabled={!isReady}
        onClick={onContinue}
        type="button"
      >
        Sprawdź warunki wodne
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
      <p aria-live="polite" className="sr-only">
        {isReady ? "Filtry są gotowe." : "Wybierz uprawę i popraw daty, aby przejść do raportu."}
      </p>
    </div>
  );
}
