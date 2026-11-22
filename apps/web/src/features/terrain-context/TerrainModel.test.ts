import { describe, expect, it } from "vitest";
import { isPointInRing } from "./terrain-model-geometry";

describe("isPointInRing", () => {
  it("finishes the ring traversal and distinguishes inside from outside", () => {
    const ring: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];

    expect(isPointInRing([5, 5], ring)).toBe(true);
    expect(isPointInRing([15, 5], ring)).toBe(false);
  });
});
