import { describe, expect, it } from "vitest";
import { validateWorkspaceSearchParams } from "./workspace-search-params";

const bounds = { min: "2016-11-22", max: "2026-11-22" };
const parcel = "141201_1.0001.6509";
const validReport = `parcel=${parcel}&crop=ziemniak&analysisDate=2026-06-01&panel=report`;

describe("workspace link validation", () => {
  it.each([
    "",
    `parcel=${parcel}`,
    "crop=ziemniak",
    "dateMode=day",
    "dateMode=range&dateFrom=2016-11-22&dateTo=2026-11-22",
    "mapLat=52.22968&mapLon=21.01223&mapZoom=9",
    `${validReport}&weatherPeriod=season`,
    `parcel=${parcel}&crop=ziemniak&dateMode=range&dateFrom=2026-01-01&dateTo=2026-06-01&panel=report`,
  ])("accepts initial, partial and complete supported settings: %s", (query) => {
    const params = new URLSearchParams(query);
    const result = validateWorkspaceSearchParams(params, bounds);
    expect(result.issues).toEqual([]);
    expect(result.repairedParams.toString()).toBe(params.toString());
  });

  it.each([
    "unknown=anything",
    "crop=unknown",
    "crop=",
    "crop=ziemniak&crop=ziemniak",
    "analysisDate=2026-06-01&analysisDate=2026-06-02",
    "dateMode=day&dateMode=range&analysisDate=2026-06-01",
    "dateMode=range&dateFrom=2026-06-01&dateFrom=2026-06-02&dateTo=2026-06-03",
    "dateMode=range&dateFrom=2026-06-01&dateTo=2026-06-02&dateTo=2026-06-03",
    "analysisDate=invalid",
    "analysisDate=2026-02-30",
    "analysisDate=2016-11-21",
    "analysisDate=2026-11-23",
    "dateMode=other&analysisDate=2026-06-01",
    "dateMode=range&dateFrom=2026-06-01",
    "dateMode=range&dateFrom=2026-06-02&dateTo=2026-06-01",
    "dateMode=range&dateFrom=2026-06-01&dateTo=2026-06-02&analysisDate=2026-06-01",
    "dateMode=day&dateFrom=2026-06-01&dateTo=2026-06-02",
    "dateFrom=2026-06-01",
    "parcel=",
    "parcel=%20%20",
    `parcel=${"a".repeat(81)}`,
    `parcel=${parcel}&parcel=other`,
    "panel=other",
    "panel=report",
    "panel=report&panel=report",
    "crop=ziemniak&panel=report",
    `parcel=${parcel}&crop=ziemniak&panel=report`,
    "weatherPeriod=other",
    "weatherPeriod=7-days&weatherPeriod=30-days",
    "mapLat=52",
    "mapLat=invalid&mapLon=21&mapZoom=9",
    "mapLat=52&mapLon=21&mapZoom=99",
    "mapLat=0&mapLon=0&mapZoom=9",
    "mapLat=52&mapLat=53&mapLon=21&mapZoom=9",
    "mapLat=52&mapLon=21&mapZoom=9&mapZoom=9",
    "crop=%E0%A4%A&analysisDate=%00&mapLat=%FF",
  ])("explains invalid settings and produces an unambiguous recovery URL: %s", (query) => {
    const params = new URLSearchParams(query);
    const original = params.toString();
    const result = validateWorkspaceSearchParams(params, bounds);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.repairedParams.has("panel")).toBe(false);
    expect(validateWorkspaceSearchParams(result.repairedParams, bounds).issues).toEqual([]);
    expect(params.toString()).toBe(original);
  });

  it("preserves valid selections while removing unknown settings and returning to setup", () => {
    const result = validateWorkspaceSearchParams(
      new URLSearchParams(
        `${validReport}&unknown=1&weatherPeriod=90-days&mapLat=52&mapLon=21&mapZoom=9`,
      ),
      bounds,
    );
    expect(Object.fromEntries(result.repairedParams)).toEqual({
      parcel,
      crop: "ziemniak",
      analysisDate: "2026-06-01",
      weatherPeriod: "90-days",
      mapLat: "52",
      mapLon: "21",
      mapZoom: "9",
    });
    expect(result.parcelIdentifier).toBe(parcel);
    expect(result.mapView).toEqual({ latitude: 52, longitude: 21, zoom: 9 });
  });

  it.each(["parcel=", `parcel=${parcel}&parcel=other`])(
    "does not select a parcel from invalid or ambiguous input: %s",
    (query) => {
      expect(
        validateWorkspaceSearchParams(new URLSearchParams(query), bounds).parcelIdentifier,
      ).toBeNull();
    },
  );

  it("discards every repeated crop value rather than choosing the first", () => {
    const result = validateWorkspaceSearchParams(
      new URLSearchParams(`${validReport}&crop=unknown`),
      bounds,
    );
    expect(result.repairedParams.has("crop")).toBe(false);
    expect(result.repairedParams.get("analysisDate")).toBe("2026-06-01");
    expect(result.repairedParams.get("parcel")).toBe(parcel);
  });
});
