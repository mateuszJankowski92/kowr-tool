import { describe, expect, it } from "vitest";
import { HYDROLOGY_MARKER_RADIUS, layoutHydrologyMarkers } from "./hydrology-marker-layout";

function expectSeparated(positions: [number, number][]) {
  for (const [index, position] of positions.entries()) {
    for (const other of positions.slice(index + 1)) {
      expect(Math.hypot(position[0] - other[0], position[1] - other[1])).toBeGreaterThan(
        2 * (HYDROLOGY_MARKER_RADIUS + 1),
      );
    }
  }
}

describe("hydrology marker layout", () => {
  it("keeps isolated labels at their source locations", () => {
    const anchors: [number, number][] = [
      [80, 60],
      [200, 180],
    ];
    expect(layoutHydrologyMarkers(anchors, [320, 320])).toEqual(anchors);
    expect(layoutHydrologyMarkers([], [320, 320])).toEqual([]);
  });

  it("separates identical and nearby anchors without hiding or renumbering labels", () => {
    const anchors: [number, number][] = [
      [160, 60],
      [160, 90],
      [160, 60],
      [162, 61],
    ];
    const positions = layoutHydrologyMarkers(anchors, [320, 320]);
    expect(positions).toHaveLength(4);
    expect(positions[0]).toEqual(anchors[0]);
    expectSeparated(positions);
    expect(layoutHydrologyMarkers(anchors, [320, 320])).toEqual(positions);
  });

  it.each([
    [1, 1],
    [319, 1],
    [1, 319],
    [319, 319],
  ])("keeps colliding labels inside the map near corner (%s, %s)", (x, y) => {
    const positions = layoutHydrologyMarkers(
      [
        [x, y],
        [x, y],
        [x, y],
        [x, y],
      ],
      [320, 320],
    );
    expectSeparated(positions);
    for (const position of positions) {
      for (const value of position) {
        expect(value).toBeGreaterThan(HYDROLOGY_MARKER_RADIUS + 1);
        expect(value).toBeLessThan(320 - HYDROLOGY_MARKER_RADIUS - 1);
      }
    }
  });

  it("leaves offscreen anchors outside the map", () => {
    const anchors: [number, number][] = [
      [-50, 80],
      [350, 80],
    ];
    expect(layoutHydrologyMarkers(anchors, [320, 320])).toEqual(anchors);
  });

  it("returns labels to their anchors when zooming separates the objects", () => {
    expectSeparated(
      layoutHydrologyMarkers(
        [
          [100, 100],
          [110, 100],
        ],
        [640, 320],
      ),
    );
    expect(
      layoutHydrologyMarkers(
        [
          [100, 100],
          [180, 100],
        ],
        [640, 320],
      ),
    ).toEqual([
      [100, 100],
      [180, 100],
    ]);
  });
});
