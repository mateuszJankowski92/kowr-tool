import { describe, expect, it } from "vitest";
import {
  ARIMR_CROP_PROFILE_MAPPINGS,
  CROP_WATER_PROFILES,
  FAO56_CROP_PARAMETER_SOURCES,
  findCropWaterProfile,
  findCropWaterProfileIdForArimrCrop,
  getCropModelCapability,
  getCropWaterProfileAssumptionsForArimrCrop,
} from "./crop-water-profiles.js";

describe("FAO-56 crop water profiles", () => {
  it("retains the pilot profiles alongside the extended reference profiles", () => {
    expect(CROP_WATER_PROFILES.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "winter-wheat",
        "spring-wheat",
        "grain-maize",
        "potato",
        "sugar-beet",
        "rapeseed",
        "faba-bean",
        "pome-orchard",
      ]),
    );
  });

  it("uses the FAO dry-seed faba bean row for bobik", () => {
    expect(findCropWaterProfile("faba-bean")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.5, maximum: 0.5 },
        midSeason: { minimum: 1.15, maximum: 1.15 },
        lateSeason: { minimum: 0.3, maximum: 0.3 },
      },
      maximumRootDepthMeters: { minimum: 0.5, maximum: 0.7 },
      depletionFractionAtFiveMillimetersPerDay: 0.45,
    });
    expect(findCropWaterProfileIdForArimrCrop("bobik")).toBe("faba-bean");
    expect(findCropWaterProfileIdForArimrCrop("bob")).toBe("broad-bean");
  });

  it("preserves the published Kc, root-depth, and p parameters", () => {
    expect(findCropWaterProfile("winter-wheat")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.4, maximum: 0.7 },
        midSeason: { minimum: 1.15, maximum: 1.15 },
        lateSeason: { minimum: 0.25, maximum: 0.4 },
      },
      maximumRootDepthMeters: { minimum: 1.5, maximum: 1.8 },
      depletionFractionAtFiveMillimetersPerDay: 0.55,
    });
    expect(findCropWaterProfile("grain-maize")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.3, maximum: 0.3 },
        midSeason: { minimum: 1.2, maximum: 1.2 },
        lateSeason: { minimum: 0.35, maximum: 0.6 },
      },
      maximumRootDepthMeters: { minimum: 1, maximum: 1.7 },
      depletionFractionAtFiveMillimetersPerDay: 0.55,
    });
    expect(findCropWaterProfile("potato")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.5, maximum: 0.5 },
        midSeason: { minimum: 1.15, maximum: 1.15 },
        lateSeason: { minimum: 0.4, maximum: 0.75 },
      },
      maximumRootDepthMeters: { minimum: 0.4, maximum: 0.6 },
      depletionFractionAtFiveMillimetersPerDay: 0.35,
    });
    expect(findCropWaterProfile("spring-wheat")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.3, maximum: 0.3 },
        midSeason: { minimum: 1.15, maximum: 1.15 },
        lateSeason: { minimum: 0.25, maximum: 0.4 },
      },
      maximumRootDepthMeters: { minimum: 1, maximum: 1.5 },
      depletionFractionAtFiveMillimetersPerDay: 0.55,
    });
    expect(findCropWaterProfile("sugar-beet")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.35, maximum: 0.35 },
        midSeason: { minimum: 1.2, maximum: 1.2 },
        lateSeason: { minimum: 0.7, maximum: 1 },
      },
      maximumRootDepthMeters: { minimum: 0.7, maximum: 1.2 },
      depletionFractionAtFiveMillimetersPerDay: 0.55,
    });
    expect(findCropWaterProfile("rapeseed")).toMatchObject({
      cropCoefficients: {
        initial: { minimum: 0.35, maximum: 0.35 },
        midSeason: { minimum: 1, maximum: 1.15 },
        lateSeason: { minimum: 0.35, maximum: 0.35 },
      },
      maximumRootDepthMeters: { minimum: 1, maximum: 1.5 },
      depletionFractionAtFiveMillimetersPerDay: 0.6,
    });
  });

  it("keeps all numeric ranges ordered and physically usable", () => {
    for (const profile of CROP_WATER_PROFILES) {
      const ranges = [
        profile.cropCoefficients.initial,
        profile.cropCoefficients.midSeason,
        profile.cropCoefficients.lateSeason,
        profile.maximumRootDepthMeters,
      ];
      for (const parameterRange of ranges) {
        expect(parameterRange.minimum).toBeGreaterThan(0);
        expect(parameterRange.maximum).toBeGreaterThanOrEqual(parameterRange.minimum);
      }
      expect(profile.maximumRootDepthMeters.maximum).toBeLessThanOrEqual(2);
      expect(profile.depletionFractionAtFiveMillimetersPerDay).toBeGreaterThan(0);
      expect(profile.depletionFractionAtFiveMillimetersPerDay).toBeLessThan(1);
    }
  });

  it("marks every FAO stage-duration row as non-Polish reference material", () => {
    for (const profile of CROP_WATER_PROFILES) {
      for (const reference of profile.stageDurationReferences) {
        expect(reference.use).toBe("reference-only-not-poland-calibrated");
        expect(Object.values(reference.durations).every((days) => days > 0)).toBe(true);
      }
    }
    expect(findCropWaterProfile("rapeseed").stageDurationReferences).toEqual([
      expect.objectContaining({
        source: "project-adapted-reference",
        durations: { initialDays: 17, developmentDays: 188, midSeasonDays: 70, lateSeasonDays: 42 },
      }),
      expect.objectContaining({
        source: "project-adapted-reference",
        durations: { initialDays: 18, developmentDays: 199, midSeasonDays: 74, lateSeasonDays: 44 },
      }),
    ]);
  });

  it("records authoritative locations for every parameter family", () => {
    expect(FAO56_CROP_PARAMETER_SOURCES.map(({ id }) => id)).toEqual([
      "fao56-table-11",
      "fao56-table-12",
      "fao56-table-22",
    ]);
    expect(
      FAO56_CROP_PARAMETER_SOURCES.every(({ url }) => url.startsWith("https://www.fao.org/")),
    ).toBe(true);
  });
});

describe("ARiMR crop profile mappings", () => {
  it("preserves the exact pilot mappings while adding species and crop groups", () => {
    expect(
      ARIMR_CROP_PROFILE_MAPPINGS.map(({ arimrCropId, profileId }) => [arimrCropId, profileId]),
    ).toEqual(
      expect.arrayContaining([
        ["burak-cukrowy", "sugar-beet"],
        ["kukurydza-na-ziarno", "grain-maize"],
        ["pszenica-zwyczajna-jara", "spring-wheat"],
        ["pszenica-zwyczajna-ozima", "winter-wheat"],
        ["rzepak-ozimy", "rapeseed"],
        ["ziemniak", "potato"],
        ["bobik", "faba-bean"],
        ["soja-zwyczajna", "soybean"],
        ["jablon", "pome-orchard"],
      ]),
    );
  });

  it.each(["pieczarka", "unknown-crop"])("does not infer plant roots for %s", (arimrCropId) => {
    expect(findCropWaterProfileIdForArimrCrop(arimrCropId)).toBeNull();
  });

  it.each([
    ["pszenica-orkisz-jary", "spring-wheat"],
    ["pszenica-orkisz-ozimy", "winter-wheat"],
    ["pszenica-plaskurka-jara", "spring-wheat"],
    ["pszenica-plaskurka-ozima", "winter-wheat"],
    ["pszenica-samopsza-jara", "spring-wheat"],
    ["pszenica-samopsza-ozima", "winter-wheat"],
  ])("preserves the season and exposes the group proxy for %s", (crop, profile) => {
    expect(findCropWaterProfileIdForArimrCrop(crop)).toBe(profile);
    expect(getCropWaterProfileAssumptionsForArimrCrop(crop).join(" ")).toContain(
      "not species-specific calibration",
    );
  });

  it("keeps green silage harvest distinct from grain maize and identifies calendar adaptation", () => {
    expect(findCropWaterProfileIdForArimrCrop("kukurydza-na-kiszonke")).toBe("silage-maize");
    const silage = findCropWaterProfile("silage-maize");
    expect(silage.cropCoefficients.lateSeason).toEqual({ minimum: 0.95, maximum: 0.95 });
    expect(silage.maximumRootDepthMeters).toEqual({ minimum: 0.6, maximum: 1.5 });
    expect(silage.depletionFractionAtFiveMillimetersPerDay).toBe(0.5);
    expect(silage.stageDurationReferences[0]?.source).toBe("project-adapted-reference");
    expect(silage.limitations.join(" ")).toContain("2025");
    expect(findCropWaterProfile("grain-maize").cropCoefficients.lateSeason.maximum).toBe(0.6);
  });

  it.each([
    ["batat", "sweet-potato", [0.5, 1.1, 0.65], [1, 1.2], 0.45],
    ["por", "leek", [0.7, 1, 0.9], [0.3, 0.9], 0.3],
    ["pasternak-zwyczajny", "parsnip", [0.5, 1.05, 1], [0.5, 1], 0.4],
    ["brukiew-jadalna", "rutabaga", [0.5, 1.1, 1], [0.5, 1], 0.4],
    ["rzepa-jadalna", "turnip", [0.5, 1.05, 1], [0.5, 0.9], 0.4],
    ["krokosz-barwierski", "safflower", [0.35, 1.05, 0.25], [1, 2], 0.6],
  ] as const)("uses the revised FAO reference row for %s", (crop, id, kc, roots, p) => {
    expect(findCropWaterProfileIdForArimrCrop(crop)).toBe(id);
    const profile = findCropWaterProfile(id);
    expect(Object.values(profile.cropCoefficients).map((range) => range.minimum)).toEqual(kc);
    expect(profile.maximumRootDepthMeters).toEqual({ minimum: roots[0], maximum: roots[1] });
    expect(profile.depletionFractionAtFiveMillimetersPerDay).toBe(p);
    expect(getCropWaterProfileAssumptionsForArimrCrop(crop).join(" ")).toContain(
      "https://doi.org/10.4060/cd6621en",
    );
  });
});

describe("crop model availability and reference quality", () => {
  it.each([
    ["seradela-uprawna", "estimated-annual-legume"],
    ["seradela-uprawna-na-nasiona", "estimated-legume-seed"],
    ["seradela-uprawna-na-zielony-nawoz", "estimated-green-manure"],
    ["lucerna-siewna", "estimated-perennial-legume"],
    ["trawy-na-gruntach-ornych", "estimated-grass"],
    ["mieszanka-zbozowa-gatunkow-ozimych", "winter-wheat"],
    ["gryka-tatarka", "buckwheat"],
  ])("provides an explicit estimate with disclosed assumptions for %s", (crop, profileId) => {
    expect(getCropModelCapability(crop)).toEqual({ kind: "approximate", profileId });
    expect(getCropWaterProfileAssumptionsForArimrCrop(crop).join(" ")).toContain(
      "Project group estimate",
    );
  });

  it("keeps mappings unique and separates seed, summer cover and overwintering calendars", () => {
    const ids = ARIMR_CROP_PROFILE_MAPPINGS.map(({ arimrCropId }) => arimrCropId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      findCropWaterProfile("estimated-legume-seed").cropCoefficients.lateSeason.maximum,
    ).toBeLessThan(
      findCropWaterProfile("estimated-green-manure").cropCoefficients.lateSeason.minimum,
    );
    expect(
      findCropWaterProfileIdForArimrCrop("lucerna-siewna-na-zielony-nawoz-w-roku-nastepnym"),
    ).toBe("estimated-winter-cover");
    expect(findCropWaterProfile("estimated-green-manure").seasonType).toBe("spring");
    expect(findCropWaterProfile("estimated-winter-cover").seasonType).toBe("winter");
  });

  it.each([
    ["zyto-jare", "spring-rye", "spring", [0.3, 1, 0.25], [0.6, 1.2], 0.55],
    ["zyto-ozime", "winter-rye", "winter", [0.3, 1, 0.25], [0.6, 1.2], 0.55],
    ["jeczmien-ozimy", "winter-barley", "winter", [0.3, 1.1, 0.25], [0.6, 1.2], 0.55],
    ["rzepak-jary", "spring-rapeseed", "spring", [0.5, 1.1, 0.35], [0.8, 1.3], 0.5],
    ["gryka-zwyczajna", "buckwheat", "spring", [0.3, 1.05, 0.25], [0.6, 1.2], 0.55],
    ["truskawka", "strawberry", "perennial", [0.4, 0.85, 0.75], [0.2, 0.3], 0.2],
  ] as const)(
    "preserves reference parameters and discloses the phase proxy for %s",
    (crop, id, season, kc, roots, p) => {
      const profile = findCropWaterProfile(id);
      expect(findCropWaterProfileIdForArimrCrop(crop)).toBe(id);
      expect(profile.seasonType).toBe(season);
      expect(Object.values(profile.cropCoefficients).map((range) => range.minimum)).toEqual(kc);
      expect(profile.maximumRootDepthMeters).toEqual({ minimum: roots[0], maximum: roots[1] });
      expect(profile.depletionFractionAtFiveMillimetersPerDay).toBe(p);
      expect(getCropModelCapability(crop)).toEqual({ kind: "approximate", profileId: id });
    },
  );

  it.each([
    ["pszenzyto-jare", "spring-wheat"],
    ["pszenzyto-ozime", "winter-wheat"],
  ])("marks the correct-season wheat transfer as approximate for %s", (crop, profileId) => {
    expect(getCropModelCapability(crop)).toEqual({ kind: "approximate", profileId });
    expect(getCropWaterProfileAssumptionsForArimrCrop(crop).join(" ")).toContain("triticale proxy");
  });

  it("distinguishes an own-species reference, a borrowed parameter and a borrowed calendar", () => {
    expect(getCropModelCapability("pszenica-zwyczajna-jara").kind).toBe("species-reference");
    expect(getCropModelCapability("bobik").kind).toBe("species-reference");
    expect(getCropModelCapability("burak-lisciowy-bocwina").kind).toBe("approximate");
    expect(getCropModelCapability("por").kind).toBe("approximate");
    expect(getCropModelCapability("rzepak-ozimy").kind).toBe("approximate");
  });

  it.each(["pieczarka", "unknown-crop"])(
    "does not turn absent model metadata into crop calculations for %s",
    (crop) => {
      expect(getCropModelCapability(crop)).toEqual({ kind: "environment-only", profileId: null });
    },
  );

  it("keeps the spring-rape and winter-rape production calendars distinct", () => {
    const spring = findCropWaterProfile("spring-rapeseed");
    expect(spring.stageDurationReferences[0]?.durations).toEqual({
      initialDays: 20,
      developmentDays: 32,
      midSeasonDays: 57,
      lateSeasonDays: 20,
    });
    expect(spring.stageDurationReferences[0]?.context).toContain("COBORU");
    expect(findCropWaterProfile("rapeseed").seasonType).toBe("winter");
  });
});
