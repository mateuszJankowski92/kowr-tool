import { describe, expect, it } from "vitest";
import { CROP_WATER_PROFILES } from "./crop-water-profiles.js";
import {
  getStandardSeasonStartDate,
  STANDARD_SEASON_START_ASSUMPTIONS,
} from "./standard-phenology.js";

describe("standard phenology assumptions", () => {
  it("defines a standard start for every supported crop profile", () => {
    expect(Object.keys(STANDARD_SEASON_START_ASSUMPTIONS).sort()).toEqual(
      CROP_WATER_PROFILES.map(({ id }) => id).sort(),
    );
  });

  it("uses the standard start from the analysis year when it has already occurred", () => {
    expect(getStandardSeasonStartDate("spring-wheat", "2025-06-30")).toBe("2025-03-25");
    expect(getStandardSeasonStartDate("winter-wheat", "2025-11-15")).toBe("2025-09-25");
  });

  it("uses the previous occurrence when the standard date is later than the analysis day", () => {
    expect(getStandardSeasonStartDate("winter-wheat", "2025-06-30")).toBe("2024-09-25");
    expect(getStandardSeasonStartDate("spring-wheat", "2025-02-10")).toBe("2024-03-25");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => getStandardSeasonStartDate("potato", "2025-02-30")).toThrow(RangeError);
  });

  it("uses autumn establishment for winter crops and a spring canopy start for strawberries", () => {
    expect(getStandardSeasonStartDate("winter-rye", "2025-06-15")).toBe("2024-09-20");
    expect(getStandardSeasonStartDate("winter-barley", "2025-06-15")).toBe("2024-09-15");
    expect(getStandardSeasonStartDate("spring-rye", "2025-06-15")).toBe("2025-03-25");
    expect(getStandardSeasonStartDate("spring-rapeseed", "2025-06-15")).toBe("2025-04-10");
    expect(getStandardSeasonStartDate("strawberry", "2025-06-15")).toBe("2025-04-01");
  });
});
