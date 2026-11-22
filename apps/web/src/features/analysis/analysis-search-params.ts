import { AnalysisDateSelectionSchema, CropSchema } from "@kowr/contracts";
import {
  type AnalysisDateBounds,
  validateAnalysisDay,
  validateAnalysisRange,
} from "./analysis-date";

export function getValidAnalysisSelection(
  searchParams: URLSearchParams,
  bounds: AnalysisDateBounds,
) {
  if (
    ["crop", "dateMode", "analysisDate", "dateFrom", "dateTo"].some(
      (parameter) => searchParams.getAll(parameter).length > 1,
    )
  ) {
    return null;
  }

  const crop = CropSchema.safeParse(searchParams.get("crop"));
  const mode = searchParams.get("dateMode");
  if (mode !== null && mode !== "day" && mode !== "range") return null;
  if (
    mode === "range"
      ? searchParams.has("analysisDate")
      : searchParams.has("dateFrom") || searchParams.has("dateTo")
  ) {
    return null;
  }

  const dateSelection = AnalysisDateSelectionSchema.safeParse(
    mode === "range"
      ? {
          type: "range",
          startDate: searchParams.get("dateFrom"),
          endDate: searchParams.get("dateTo"),
        }
      : { type: "day", date: searchParams.get("analysisDate") },
  );
  if (!crop.success || !dateSelection.success) return null;

  const selection = dateSelection.data;
  const validation =
    selection.type === "range"
      ? validateAnalysisRange(selection.startDate, selection.endDate, bounds)
      : validateAnalysisDay(selection.date, bounds);

  return validation.valid ? { crop: crop.data, dateSelection: selection } : null;
}
