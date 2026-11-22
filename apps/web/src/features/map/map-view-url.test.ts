import { describe, expect, it } from "vitest";
import {
  deleteMapViewSearchParameters,
  hasMapViewSearchParameters,
  parseMapViewFromSearchParams,
  setMapViewSearchParameters,
} from "./map-view-url";

describe("map view URL parameters", () => {
  it("parses a complete, valid map view", () => {
    const searchParams = new URLSearchParams({
      mapLat: "52.22968",
      mapLon: "21.01223",
      mapZoom: "9",
    });

    expect(parseMapViewFromSearchParams(searchParams, 12)).toEqual({
      latitude: 52.22968,
      longitude: 21.01223,
      zoom: 9,
    });
  });

  it.each([
    new URLSearchParams({ mapLat: "52", mapLon: "21" }),
    new URLSearchParams({ mapLat: "north", mapLon: "21", mapZoom: "9" }),
    new URLSearchParams({ mapLat: "91", mapLon: "21", mapZoom: "9" }),
    new URLSearchParams({ mapLat: "52", mapLon: "181", mapZoom: "9" }),
    new URLSearchParams({ mapLat: "52", mapLon: "21", mapZoom: "13" }),
    new URLSearchParams({ mapLat: "", mapLon: "21", mapZoom: "9" }),
    new URLSearchParams({ mapLat: " ", mapLon: "21", mapZoom: "9" }),
    new URLSearchParams({ mapLat: "NaN", mapLon: "21", mapZoom: "9" }),
    new URLSearchParams({ mapLat: "52", mapLon: "Infinity", mapZoom: "9" }),
    new URLSearchParams({ mapLat: "52", mapLon: "21", mapZoom: "-1" }),
    new URLSearchParams({ mapLat: "0x34", mapLon: "21", mapZoom: "9" }),
    new URLSearchParams("mapLat=52&mapLat=53&mapLon=21&mapZoom=9"),
    new URLSearchParams("mapLat=52&mapLon=21&mapZoom=9&mapZoom=9"),
  ])("rejects an incomplete or out-of-range map view", (searchParams) => {
    expect(parseMapViewFromSearchParams(searchParams, 12)).toBeNull();
  });

  it("writes a stable, compact representation without changing other state", () => {
    const searchParams = new URLSearchParams({ crop: "wheat" });

    setMapViewSearchParameters(searchParams, {
      latitude: 52.2296759,
      longitude: 21.0122294,
      zoom: 9.000_000_1,
    });

    expect(searchParams.toString()).toBe("crop=wheat&mapLat=52.22968&mapLon=21.01223&mapZoom=9");
  });

  it("detects and removes complete or partial map state", () => {
    const searchParams = new URLSearchParams("parcel=123&mapLat=52&mapZoom=9");

    expect(hasMapViewSearchParameters(searchParams)).toBe(true);
    deleteMapViewSearchParameters(searchParams);

    expect(hasMapViewSearchParameters(searchParams)).toBe(false);
    expect(searchParams.toString()).toBe("parcel=123");
  });
});
