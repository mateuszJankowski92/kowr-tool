import { describe, expect, it, vi } from "vitest";
import type { WeatherConditionsProviderError } from "../../features/weather-conditions/weather-conditions-provider.js";
import { createOpenMeteoWeatherProvider } from "./open-meteo-weather-provider.js";

function responsePayload() {
  return {
    latitude: 52.15,
    longitude: 21.55,
    daily_units: { shortwave_radiation_sum: "MJ/m²" },
    daily: {
      time: ["2025-03-20", "2025-03-21"],
      precipitation_sum: [1.5, null],
      shortwave_radiation_sum: [18.75, null],
      et0_fao_evapotranspiration: [2.75, 2.8],
      temperature_2m_mean: [8, 9],
      temperature_2m_min: [2, 3],
      temperature_2m_max: [14, 15],
    },
  };
}

describe("Open-Meteo weather provider", () => {
  it("requests and maps one continuous ERA5 date range", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(responsePayload()));
    const provider = createOpenMeteoWeatherProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
    });

    const first = await provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21");
    const second = await provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("start_date")).toBe("2025-03-20");
    expect(url.searchParams.get("end_date")).toBe("2025-03-21");
    expect(url.searchParams.get("daily")).toContain("shortwave_radiation_sum");
    expect(url.searchParams.get("models")).toBe("era5");
    expect(url.searchParams.get("timezone")).toBe("Europe/Warsaw");
    expect(first).toEqual(second);
    expect(first.days).toEqual([
      {
        date: "2025-03-20",
        precipitationMm: 1.5,
        et0Mm: 2.75,
        temperatureMeanCelsius: 8,
        temperatureMinCelsius: 2,
        temperatureMaxCelsius: 14,
        solarRadiationMjPerM2: 18.75,
      },
      {
        date: "2025-03-21",
        precipitationMm: null,
        et0Mm: 2.8,
        temperatureMeanCelsius: 9,
        temperatureMinCelsius: 3,
        temperatureMaxCelsius: 15,
        solarRadiationMjPerM2: null,
      },
    ]);
    expect(first.source).toMatchObject({
      provider: "Open-Meteo",
      model: "ERA5",
      retrievedAt: "2026-11-21T12:00:00.000Z",
    });
  });

  it("rejects an unexpected radiation unit", async () => {
    const payload = responsePayload();
    payload.daily_units.shortwave_radiation_sum = "W/m²";
    const provider = createOpenMeteoWeatherProvider({
      fetch: vi.fn().mockResolvedValue(Response.json(payload)),
      logger: { warn: vi.fn() },
    });
    await expect(provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21")).rejects.toMatchObject(
      { code: "INVALID_RESPONSE" },
    );
  });

  it("exposes rate limiting as a typed provider failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const provider = createOpenMeteoWeatherProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });

    await expect(provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21")).rejects.toMatchObject(
      {
        code: "RATE_LIMITED",
      } satisfies Partial<WeatherConditionsProviderError>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses complete historical data", async () => {
    const payload = responsePayload();
    payload.daily.precipitation_sum[1] = 0;
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(payload));
    const provider = createOpenMeteoWeatherProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });
    await provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21");
    await provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21");
    const subset = await provider.getDaily(21.55, 52.15, "2025-03-21", "2025-03-21");
    expect(subset.days.map(({ date }) => date)).toEqual(["2025-03-21"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry before a long Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "3600" } }));
    const provider = createOpenMeteoWeatherProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });
    await expect(provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21")).rejects.toMatchObject(
      { code: "RATE_LIMITED" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries one rate-limited request and honors a zero Retry-After value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(Response.json(responsePayload()));
    const provider = createOpenMeteoWeatherProvider({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
    });

    const result = await provider.getDaily(21.55, 52.15, "2025-03-20", "2025-03-21");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.days).toHaveLength(2);
  });
});

describe("ECMWF operational analysis", () => {
  it("requests a whole IFS range with its own model and spatial provenance", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(responsePayload()));
    const provider = createOpenMeteoWeatherProvider({
      fetch,
      logger: { warn: vi.fn() },
      model: "ecmwf_ifs",
    });
    const result = await provider.getDaily(20.65, 54.17, "2025-03-20", "2025-03-21");
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("models")).toBe("ecmwf_ifs");
    expect(result.source).toMatchObject({
      id: "open-meteo-ecmwf-ifs",
      model: "ECMWF IFS operational analysis",
      spatialResolution: "0.1° (about 9 km)",
    });
  });
});
