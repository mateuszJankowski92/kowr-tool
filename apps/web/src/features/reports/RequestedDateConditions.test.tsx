import type { WaterAssessmentResponse } from "@kowr/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RequestedDateConditions } from "./RequestedDateConditions";

afterEach(cleanup);
const conditions: NonNullable<WaterAssessmentResponse["requestedDateConditions"]> = {
  date: "2026-11-22",
  ongoingDay: true,
  cropAssessment: "outside-modelled-season",
  status: "partial",
  period: { startDate: "2026-10-24", endDate: "2026-11-22", expectedDayCount: 30 },
  precipitationDayCount: 29,
  et0DayCount: 29,
  precipitationMm: null,
  referenceEvapotranspirationMm: null,
  differenceMm: null,
  signal: "incomplete",
  day: { precipitationMm: null, referenceEvapotranspirationMm: null },
  source: null,
};

describe("requested-date context", () => {
  it("explains the unfinished day and retains explicit gaps instead of zero totals", () => {
    render(<RequestedDateConditions conditions={conditions} />);
    expect(screen.getByRole("heading", { name: "Warunki na 22 listopada 2026" })).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Doba jeszcze trwa");
    expect(screen.getByText(/Braki danych uniemożliwiają porównanie/)).not.toBeNull();
    expect(screen.getAllByText("Brak pełnych danych")).toHaveLength(2);
    expect(screen.getByText(/Źródło danych dla żądanego dnia jest niedostępne/)).not.toBeNull();
  });
});
