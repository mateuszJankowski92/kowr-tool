import { describe, expect, it } from "vitest";
import { clampConfidence } from "./index.js";

describe("clampConfidence", () => {
  it("keeps confidence inside the 0–1 range", () => {
    expect(clampConfidence(-0.2)).toBe(0);
    expect(clampConfidence(0.72)).toBe(0.72);
    expect(clampConfidence(1.4)).toBe(1);
  });
});
