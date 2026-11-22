export type AnalysisDateBounds = {
  min: string;
  max: string;
};

export type AnalysisDateValidation = { valid: true } | { valid: false; message: string };

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function subtractCalendarYears(date: Date, years: number): Date {
  const result = new Date(date.getFullYear() - years, date.getMonth(), date.getDate());

  if (result.getMonth() !== date.getMonth()) {
    result.setDate(0);
  }

  return result;
}

export function getAnalysisDateBounds(today: Date): AnalysisDateBounds {
  return {
    min: formatLocalDate(subtractCalendarYears(today, 10)),
    max: formatLocalDate(today),
  };
}

export function validateAnalysisDay(
  date: string,
  bounds: AnalysisDateBounds,
): AnalysisDateValidation {
  if (!date) return { valid: false, message: "Wybierz dzień analizy." };

  if (!isCalendarDate(date)) {
    return { valid: false, message: "Wybierz poprawną datę w kalendarzu." };
  }

  if (date < bounds.min || date > bounds.max) {
    return {
      valid: false,
      message: "Wybierz dzień z ostatnich 10 lat, nie późniejszy niż dzisiaj.",
    };
  }

  return { valid: true };
}

export function validateAnalysisRange(
  startDate: string,
  endDate: string,
  bounds: AnalysisDateBounds,
): AnalysisDateValidation {
  if (!startDate || !endDate) {
    return { valid: false, message: "Wybierz początek i koniec okresu." };
  }

  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    return { valid: false, message: "Wybierz poprawne daty w kalendarzu." };
  }

  if (startDate > endDate) {
    return { valid: false, message: "Początek okresu nie może być późniejszy niż koniec." };
  }

  if (startDate < bounds.min || endDate > bounds.max) {
    return {
      valid: false,
      message: "Cały okres musi mieścić się w ostatnich 10 latach i kończyć najpóźniej dzisiaj.",
    };
  }

  return { valid: true };
}

import { z } from "zod";

const calendarDateSchema = z.iso.date();

export function isCalendarDate(value: string): boolean {
  return calendarDateSchema.safeParse(value).success;
}
