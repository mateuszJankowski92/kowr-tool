import { describe, expect, it, vi } from "vitest";
import { WeatherConditionsProviderError } from "../../features/weather-conditions/weather-conditions-provider.js";
import { createNasaPowerWeatherProvider } from "./nasa-power-weather-provider.js";

const units = {
  PRECTOTCORR: { units: "mm/day", longname: "Precipitation Corrected" },
  T2M: { units: "C", longname: "Temperature at 2 Meters" },
  T2M_MAX: { units: "C", longname: "Maximum Temperature" },
  T2M_MIN: { units: "C", longname: "Minimum Temperature" },
  T2MDEW: { units: "C", longname: "Dew Point" },
  WS2M: { units: "m/s", longname: "Wind Speed at 2 Meters" },
  PS: { units: "kPa", longname: "Surface Pressure" },
  ALLSKY_SFC_SW_DWN: {
    units: "MJ/m^2/day",
    longname: "All Sky Surface Shortwave Downward Irradiance",
  },
};

function createResponse(solarRadiation: number, precipitation = 0) {
  return {
    header: { fill_value: -999, time_standard: "UTC" },
    geometry: { type: "Point", coordinates: [21.55, 52.15, 125.44] },
    parameters: units,
    properties: {
      parameter: {
        PRECTOTCORR: { "20260831": precipitation },
        T2M: { "20260831": 21.96 },
        T2M_MAX: { "20260831": 28.3 },
        T2M_MIN: { "20260831": 16.53 },
        T2MDEW: { "20260831": 14.58 },
        WS2M: { "20260831": 1.86 },
        PS: { "20260831": 99.86 },
        ALLSKY_SFC_SW_DWN: { "20260831": solarRadiation },
      },
    },
  };
}

function createProvider(response: unknown) {
  return createNasaPowerWeatherProvider({
    fetch: vi.fn().mockResolvedValue(Response.json(response)),
    logger: { warn: vi.fn() },
    now: () => new Date("2026-11-21T12:00:00.000Z"),
  });
}

describe("NASA POWER weather provider", () => {
  it("uses the reported MJ/m²/day radiation directly when calculating ET0", async () => {
    const provider = createProvider(createResponse(12.49, 2.25));

    const series = await provider.getDaily(21.55, 52.15, "2026-08-31", "2026-08-31");

    expect(series.days[0]).toMatchObject({
      date: "2026-08-31",
      precipitationMm: 2.25,
      solarRadiationMjPerM2: 12.49,
      temperatureMeanCelsius: 21.96,
    });
    expect(series.days[0]?.et0Mm).toBeGreaterThan(2);
    expect(series.days[0]?.et0Mm).toBeLessThan(6);
  });

  it("keeps zero precipitation but returns null ET0 for the NASA fill value", async () => {
    const provider = createProvider(createResponse(-999));

    const series = await provider.getDaily(21.55, 52.15, "2026-08-31", "2026-08-31");

    expect(series.days[0]?.precipitationMm).toBe(0);
    expect(series.days[0]?.et0Mm).toBeNull();
    expect(series.days[0]?.solarRadiationMjPerM2).toBeNull();
  });

  it("rejects an unexpected radiation unit instead of silently converting it", async () => {
    const response = createResponse(12.49);
    response.parameters.ALLSKY_SFC_SW_DWN.units = "kWh/m^2/day";
    const provider = createProvider(response);

    await expect(
      provider.getDaily(21.55, 52.15, "2026-08-31", "2026-08-31"),
    ).rejects.toBeInstanceOf(WeatherConditionsProviderError);
  });
});
