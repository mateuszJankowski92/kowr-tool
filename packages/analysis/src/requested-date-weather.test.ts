import { describe, expect, it } from "vitest";
import {
  requestedDateWeatherStart,
  summarizeRequestedDateWeather,
} from "./requested-date-weather.js";

describe("requested-date atmospheric context", () => {
  const dates = Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.UTC(2024, 1, 1 + index)).toISOString().slice(0, 10),
    precipitationMm: 1,
    et0Mm: 3,
  }));

  it("keeps an inclusive 30-day period across leap day", () => {
    expect(requestedDateWeatherStart("2024-03-01")).toBe("2024-02-01");
    expect(summarizeRequestedDateWeather("2024-03-01", [...dates].reverse())).toMatchObject({
      period: { startDate: "2024-02-01", endDate: "2024-03-01", expectedDayCount: 30 },
      precipitationMm: 30,
      referenceEvapotranspirationMm: 90,
      differenceMm: -60,
      signal: "precipitation-below-reference-et0",
      day: { precipitationMm: 1, referenceEvapotranspirationMm: 3 },
    });
  });

  it("does not turn a missing date or ET0 into zero, or use later data", () => {
    const incomplete = dates.slice(1).map((day) => ({ ...day, et0Mm: null }));
    expect(
      summarizeRequestedDateWeather("2024-03-01", [
        ...incomplete,
        { date: "2024-03-02", precipitationMm: 100, et0Mm: 100 },
      ]),
    ).toMatchObject({
      precipitationDayCount: 29,
      et0DayCount: 0,
      precipitationMm: null,
      referenceEvapotranspirationMm: null,
      differenceMm: null,
      signal: "incomplete",
    });
  });

  it("retains a valid zero and sums rainfall independently of ET0", () => {
    expect(
      summarizeRequestedDateWeather(
        "2024-03-01",
        dates.map((day) => ({
          ...day,
          precipitationMm: 0,
          et0Mm: null,
        })),
      ),
    ).toMatchObject({ precipitationMm: 0, referenceEvapotranspirationMm: null });
  });
});
