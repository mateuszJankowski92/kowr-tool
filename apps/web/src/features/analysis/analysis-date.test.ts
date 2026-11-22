import { describe, expect, it } from "vitest";
import {
  formatLocalDate,
  getAnalysisDateBounds,
  parseLocalDate,
  validateAnalysisDay,
  validateAnalysisRange,
} from "./analysis-date";

describe("analysis date selection", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-01-00", "2026-1-05", "invalid", "2026-06-01extra"])(
    "rejects malformed and impossible calendar dates: %s",
    (date) => {
      const bounds = { min: "2016-11-21", max: "2026-11-21" };
      expect(validateAnalysisDay(date, bounds).valid).toBe(false);
      expect(validateAnalysisRange(date, bounds.max, bounds).valid).toBe(false);
      expect(validateAnalysisRange(bounds.min, date, bounds).valid).toBe(false);
    },
  );

  it("validates leap days before accepting them", () => {
    const bounds = { min: "2016-11-21", max: "2026-11-21" };
    expect(validateAnalysisDay("2024-02-29", bounds).valid).toBe(true);
    expect(validateAnalysisDay("2025-02-29", bounds).valid).toBe(false);
  });

  it("builds a rolling ten-calendar-year window including today", () => {
    expect(getAnalysisDateBounds(new Date(2026, 10, 21))).toEqual({
      min: "2016-11-21",
      max: "2026-11-21",
    });
  });

  it("retains today at a month and year boundary", () => {
    expect(getAnalysisDateBounds(new Date(2026, 0, 1)).max).toBe("2026-01-01");
  });

  it("uses the last valid day of February for a leap-day boundary", () => {
    expect(getAnalysisDateBounds(new Date(2024, 1, 29)).min).toBe("2014-02-28");
  });

  it("formats dates without a UTC timezone shift", () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(parseLocalDate("2026-01-05")).toEqual(new Date(2026, 0, 5));
  });

  it("accepts a single day at either boundary", () => {
    const bounds = { min: "2016-11-21", max: "2026-11-21" };

    expect(validateAnalysisDay(bounds.min, bounds)).toEqual({ valid: true });
    expect(validateAnalysisDay(bounds.max, bounds)).toEqual({ valid: true });
  });

  it("rejects an inverted or out-of-window range", () => {
    const bounds = { min: "2016-11-21", max: "2026-11-21" };

    expect(validateAnalysisRange("2026-01-02", "2026-01-01", bounds).valid).toBe(false);
    expect(validateAnalysisRange("2016-11-20", "2026-01-01", bounds).valid).toBe(false);
    expect(validateAnalysisRange("2026-11-19", "2026-11-22", bounds)).toEqual({
      valid: false,
      message: "Cały okres musi mieścić się w ostatnich 10 latach i kończyć najpóźniej dzisiaj.",
    });
  });
});
