type WeatherRecord = {
  date: string;
  precipitationMm: number | null;
  et0Mm: number | null;
};

export function requestedDateWeatherStart(analysisDate: string): string {
  return new Date(Date.parse(`${analysisDate}T00:00:00Z`) - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Atmospheric demand over 30 days is context, not soil moisture or crop water stress. */
export function summarizeRequestedDateWeather(
  analysisDate: string,
  days: readonly WeatherRecord[],
) {
  const startDate = requestedDateWeatherStart(analysisDate);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const records = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return byDate.get(date);
  });
  const precipitationDayCount = records.filter(
    (day) => day?.precipitationMm !== null && day?.precipitationMm !== undefined,
  ).length;
  const et0DayCount = records.filter(
    (day) => day?.et0Mm !== null && day?.et0Mm !== undefined,
  ).length;
  const precipitationMm =
    precipitationDayCount === 30
      ? records.reduce((sum, day) => sum + (day?.precipitationMm ?? 0), 0)
      : null;
  const referenceEvapotranspirationMm =
    et0DayCount === 30 ? records.reduce((sum, day) => sum + (day?.et0Mm ?? 0), 0) : null;
  const differenceMm =
    precipitationMm !== null && referenceEvapotranspirationMm !== null
      ? precipitationMm - referenceEvapotranspirationMm
      : null;
  const day = byDate.get(analysisDate);
  return {
    period: { startDate, endDate: analysisDate, expectedDayCount: 30 as const },
    precipitationDayCount,
    et0DayCount,
    precipitationMm,
    referenceEvapotranspirationMm,
    differenceMm,
    signal:
      differenceMm === null
        ? ("incomplete" as const)
        : differenceMm < 0
          ? ("precipitation-below-reference-et0" as const)
          : ("precipitation-at-least-reference-et0" as const),
    day: {
      precipitationMm: day?.precipitationMm ?? null,
      referenceEvapotranspirationMm: day?.et0Mm ?? null,
    },
  };
}
