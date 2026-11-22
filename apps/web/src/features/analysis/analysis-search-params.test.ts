import { describe, expect, it } from "vitest";
import { getValidAnalysisSelection } from "./analysis-search-params";

const bounds = { min: "2016-11-22", max: "2026-11-22" };

describe("report URL validation", () => {
  it.each([
    "crop=unknown&analysisDate=2026-06-01",
    "crop=ziemniak&analysisDate=2026-02-30",
    "crop=ziemniak&analysisDate=2026-11-23",
    "crop=ziemniak&analysisDate=2016-11-21",
    "crop=ziemniak&dateMode=range&dateFrom=2026-06-01",
    "crop=ziemniak&dateMode=range&dateFrom=2026-06-02&dateTo=2026-06-01",
    "crop=ziemniak&dateMode=other&analysisDate=2026-06-01",
    "crop=ziemniak&crop=ziemniak&analysisDate=2026-06-01",
    "crop=ziemniak&analysisDate=2026-06-01&analysisDate=2026-06-02",
    "crop=ziemniak&dateMode=day&dateMode=range&analysisDate=2026-06-01",
    "crop=ziemniak&analysisDate=2026-06-01&dateFrom=2026-06-01",
    "crop=ziemniak&dateMode=range&dateFrom=2026-06-01&dateTo=2026-06-02&analysisDate=2026-06-01",
    "crop=ziemniak",
  ])("rejects incomplete or invalid report input: %s", (parameters) => {
    expect(getValidAnalysisSelection(new URLSearchParams(parameters), bounds)).toBeNull();
  });

  it("accepts today and both ends of an inclusive range", () => {
    expect(
      getValidAnalysisSelection(
        new URLSearchParams("crop=ziemniak&analysisDate=2026-11-22"),
        bounds,
      ),
    ).toEqual({ crop: "ziemniak", dateSelection: { type: "day", date: bounds.max } });
    expect(
      getValidAnalysisSelection(
        new URLSearchParams(
          `crop=ziemniak&dateMode=range&dateFrom=${bounds.min}&dateTo=${bounds.max}`,
        ),
        bounds,
      ),
    ).toEqual({
      crop: "ziemniak",
      dateSelection: { type: "range", startDate: bounds.min, endDate: bounds.max },
    });
  });
});
