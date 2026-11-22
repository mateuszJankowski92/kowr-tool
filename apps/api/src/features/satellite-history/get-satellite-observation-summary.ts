import {
  calculateSatelliteObservationTrend,
  SATELLITE_LOOKBACK_DAYS,
  selectSatelliteObservation,
  subtractCalendarDays,
} from "@kowr/analysis";
import type {
  ParcelGeometry,
  SatelliteCombinedObservation,
  SatelliteObservationSummaryResponse,
} from "@kowr/contracts";
import {
  SatelliteHistoryAuthenticationError,
  SatelliteHistoryNotConfiguredError,
  SatelliteHistoryProviderUnavailableError,
} from "./satellite-history.errors.js";
import {
  type SatelliteHistoryProvider,
  SatelliteHistoryProviderError,
} from "./satellite-history-provider.js";

function mapProviderError(error: unknown): never {
  if (error instanceof SatelliteHistoryProviderError) {
    if (error.code === "NOT_CONFIGURED") throw new SatelliteHistoryNotConfiguredError();
    if (error.code === "AUTHENTICATION_FAILED") {
      throw new SatelliteHistoryAuthenticationError();
    }
  }

  throw new SatelliteHistoryProviderUnavailableError();
}

function qualityAssessment(observation: SatelliteCombinedObservation, indicator: "ndmi" | "ndvi") {
  return observation.indicators[indicator].quality?.assessment ?? null;
}

export async function getSatelliteObservationSummary(
  geometry: ParcelGeometry,
  analysisDate: string,
  provider: SatelliteHistoryProvider,
  signal?: AbortSignal,
): Promise<SatelliteObservationSummaryResponse> {
  const fromDate = subtractCalendarDays(analysisDate, SATELLITE_LOOKBACK_DAYS);

  try {
    const series = await provider.getObservationSeries(geometry, fromDate, analysisDate, signal);
    const selection = selectSatelliteObservation(
      series.observations.map((observation) => ({
        date: observation.date,
        indicators: {
          ndmi: {
            median: observation.indicators.ndmi.median,
            quality: qualityAssessment(observation, "ndmi"),
          },
          ndvi: {
            median: observation.indicators.ndvi.median,
            quality: qualityAssessment(observation, "ndvi"),
          },
        },
      })),
      analysisDate,
    );
    const trend = calculateSatelliteObservationTrend(
      series.observations.map((observation) => ({
        date: observation.date,
        indicators: {
          ndmi: {
            median: observation.indicators.ndmi.median,
            quality: qualityAssessment(observation, "ndmi"),
          },
          ndvi: {
            median: observation.indicators.ndvi.median,
            quality: qualityAssessment(observation, "ndvi"),
          },
        },
      })),
      analysisDate,
    );
    const history = series.observations
      .filter((observation) => observation.date >= fromDate && observation.date <= analysisDate)
      .sort((left, right) => left.date.localeCompare(right.date))
      .flatMap((observation) => {
        const ndmi = observation.indicators.ndmi;
        if (
          ndmi.median === null ||
          ndmi.validPixelPercent === null ||
          ndmi.quality?.assessment !== "sufficient"
        ) {
          return [];
        }

        return [
          {
            date: observation.date,
            ndmi: ndmi.median,
            quality: ndmi.quality,
            validPixelPercent: ndmi.validPixelPercent,
          },
        ];
      });
    const selectedObservation =
      selection.selectedIndex === null
        ? null
        : (series.observations[selection.selectedIndex] ?? null);
    const statisticsUnavailable =
      series.status === "partial" &&
      series.observations.length > 0 &&
      series.observations.every(
        (observation) =>
          observation.indicators.ndmi.median === null &&
          observation.indicators.ndmi.quality === null,
      );

    return {
      analysisDate,
      history,
      limitations: series.limitations,
      provenance: series.provenance,
      reason: statisticsUnavailable ? "statistics-unavailable" : selection.reason,
      searchPeriod: {
        from: fromDate,
        maxLookbackDays: SATELLITE_LOOKBACK_DAYS,
        to: analysisDate,
      },
      selectedObservation: statisticsUnavailable ? null : selectedObservation,
      status: statisticsUnavailable ? "unavailable" : selection.status,
      trend,
    };
  } catch (error) {
    return mapProviderError(error);
  }
}
