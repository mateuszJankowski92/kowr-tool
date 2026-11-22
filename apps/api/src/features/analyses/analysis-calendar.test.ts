import { describe, expect, it } from "vitest";
import { analysisCalendarDate } from "./analysis-calendar.js";

describe("analysis calendar", () => {
  it("uses the Polish calendar day across UTC midnight and daylight saving time", () => {
    expect(analysisCalendarDate(() => new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-22");
    expect(analysisCalendarDate(() => new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01");
  });
});
