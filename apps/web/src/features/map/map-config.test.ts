import { describe, expect, it } from "vitest";
import {
  canSelectParcelAtMapPosition,
  createOrthophotoLayer,
  createTopographicLayer,
  isCoordinateInPolandMapExtent,
  isParcelSelectionZoom,
  MAP_MATRIX_IDS,
  MAP_RESOLUTIONS,
  POLAND_EXTENT,
  POLISH_PROJECTION_CODE,
} from "./map-config";

describe("map configuration", () => {
  it("uses the native Polish projection and descending service resolutions", () => {
    const topographicSource = createTopographicLayer().getSource();

    expect(topographicSource?.getProjection()?.getCode()).toBe(POLISH_PROJECTION_CODE);
    expect(MAP_RESOLUTIONS).toHaveLength(13);
    expect(
      MAP_RESOLUTIONS.every(
        (resolution, index, resolutions) =>
          index === 0 || resolution < (resolutions[index - 1] ?? Number.POSITIVE_INFINITY),
      ),
    ).toBe(true);
  });

  it("maps the common service scales to the correct WMTS matrix identifiers", () => {
    expect(MAP_MATRIX_IDS.topographic.at(0)).toBe("EPSG:2180:0");
    expect(MAP_MATRIX_IDS.topographic.at(-1)).toBe("EPSG:2180:12");
    expect(MAP_MATRIX_IDS.orthophoto.at(0)).toBe("EPSG:2180:2");
    expect(MAP_MATRIX_IDS.orthophoto.at(-1)).toBe("EPSG:2180:14");
    expect(createTopographicLayer().getVisible()).toBe(true);
    expect(createOrthophotoLayer().getVisible()).toBe(false);
  });

  it("defines a valid projected extent for the whole country", () => {
    const minX = POLAND_EXTENT[0] ?? Number.NaN;
    const minY = POLAND_EXTENT[1] ?? Number.NaN;
    const maxX = POLAND_EXTENT[2] ?? Number.NaN;
    const maxY = POLAND_EXTENT[3] ?? Number.NaN;

    expect(minX).toBeLessThan(maxX);
    expect(minY).toBeLessThan(maxY);
    expect(minX).toBeGreaterThan(100_000);
    expect(maxX).toBeLessThan(900_000);
  });

  it("limits both basemaps to Poland to avoid empty image responses outside coverage", () => {
    expect(createTopographicLayer().getExtent()).toEqual(POLAND_EXTENT);
    expect(createOrthophotoLayer().getExtent()).toEqual(POLAND_EXTENT);
  });

  it("rejects selection coordinates outside the Poland map extent", () => {
    const minX = POLAND_EXTENT[0] ?? Number.NaN;
    const minY = POLAND_EXTENT[1] ?? Number.NaN;
    const maxX = POLAND_EXTENT[2] ?? Number.NaN;
    const maxY = POLAND_EXTENT[3] ?? Number.NaN;

    expect(isCoordinateInPolandMapExtent([(minX + maxX) / 2, (minY + maxY) / 2])).toBe(true);
    expect(isCoordinateInPolandMapExtent([maxX + 1, (minY + maxY) / 2])).toBe(false);
  });

  it("enables parcel selection only at parcel-level zoom", () => {
    expect(isParcelSelectionZoom(undefined)).toBe(false);
    expect(isParcelSelectionZoom(8.99)).toBe(false);
    expect(isParcelSelectionZoom(9)).toBe(true);
    expect(isParcelSelectionZoom(12)).toBe(true);
  });

  it("accepts every map position inside Poland at parcel-level zoom", () => {
    const minX = POLAND_EXTENT[0] ?? Number.NaN;
    const minY = POLAND_EXTENT[1] ?? Number.NaN;
    const maxX = POLAND_EXTENT[2] ?? Number.NaN;
    const maxY = POLAND_EXTENT[3] ?? Number.NaN;
    const insidePoland = [(minX + maxX) / 2, (minY + maxY) / 2];

    expect(canSelectParcelAtMapPosition(9, insidePoland)).toBe(true);
    expect(canSelectParcelAtMapPosition(8, insidePoland)).toBe(false);
    expect(canSelectParcelAtMapPosition(9, [maxX + 1, insidePoland[1] ?? 0])).toBe(false);
  });
});
