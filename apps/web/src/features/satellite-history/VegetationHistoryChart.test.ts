import type { SatelliteVegetationHistoryPoint } from "@kowr/contracts";
import { describe, expect, it } from "vitest";
import { splitVegetationHistory } from "./VegetationHistoryChart";

const quality = {
  assessment: "sufficient" as const,
  geometryPixelCount: 100,
  thresholdPercent: 70,
  validPixelCount: 85,
  rejectedPixelCounts: null,
};

function observation(date: string, ndmi: number): SatelliteVegetationHistoryPoint {
  return { date, ndmi, quality, validPixelPercent: 85 };
}

describe("vegetation history chart", () => {
  it("keeps nearby observations in one line segment", () => {
    const segments = splitVegetationHistory([
      observation("2026-05-01", 0.31),
      observation("2026-05-06", 0.35),
      observation("2026-05-12", 0.34),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
  });

  it("breaks the line when the gap exceeds fourteen days", () => {
    const segments = splitVegetationHistory([
      observation("2026-05-01", 0.31),
      observation("2026-05-06", 0.35),
      observation("2026-05-25", 0.29),
    ]);

    expect(segments.map((segment) => segment.map(({ date }) => date))).toEqual([
      ["2026-05-01", "2026-05-06"],
      ["2026-05-25"],
    ]);
  });

  it("sorts observations by their real date before splitting", () => {
    const segments = splitVegetationHistory([
      observation("2026-05-10", 0.31),
      observation("2026-05-01", 0.35),
    ]);

    expect(segments[0]?.map(({ date }) => date)).toEqual(["2026-05-01", "2026-05-10"]);
  });
});
