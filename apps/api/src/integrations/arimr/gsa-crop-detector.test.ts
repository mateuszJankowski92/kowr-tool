import { describe, expect, it, vi } from "vitest";
import { createGsaCropDetector } from "./gsa-crop-detector.js";

const parcelGeometry = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0] as [number, number],
      [10, 0] as [number, number],
      [10, 10] as [number, number],
      [0, 10] as [number, number],
      [0, 0] as [number, number],
    ],
  ],
};

describe("GSA crop detector", () => {
  it("calculates exact overlaps with ARiMR declaration geometries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          numberMatched: 2,
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [0, 0],
                    [8, 0],
                    [8, 10],
                    [0, 10],
                    [0, 0],
                  ],
                ],
              },
              properties: { roslina: "pszenica zwyczajna ozima", grupa_roslin: "zboża" },
            },
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [8, 0],
                    [10, 0],
                    [10, 10],
                    [8, 10],
                    [8, 0],
                  ],
                ],
              },
              properties: { roslina: "kukurydza na ziarno", grupa_roslin: "pastewne" },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const detector = createGsaCropDetector({
      fetch: fetchMock,
      logger: { warn: vi.fn() },
      now: () => new Date("2026-11-21T12:00:00.000Z"),
      projectPosition: (position) => position,
    });

    const result = await detector.findIntersections(parcelGeometry);

    expect(result).toEqual({
      complete: true,
      intersections: [
        {
          overlapAreaSquareMeters: 80,
          sourceGroup: "zboża",
          sourceLabel: "pszenica zwyczajna ozima",
        },
        {
          overlapAreaSquareMeters: 20,
          sourceGroup: "pastewne",
          sourceLabel: "kukurydza na ziarno",
        },
      ],
      parcelAreaSquareMeters: 100,
      retrievedAt: "2026-11-21T12:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    const cqlFilter = new URLSearchParams(String(request.body)).get("cql_filter");
    expect(cqlFilter).toContain("INTERSECTS");
    expect(cqlFilter).toContain("0.000 10.000");
  });
});
