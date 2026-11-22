import { ARIMR_CROP_PROFILE_MAPPINGS } from "@kowr/analysis";
import { CROP_CATALOG, CropModelCapabilitiesResponseSchema } from "@kowr/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";

describe("GET /api/crops", () => {
  it("serves every catalog identifier exactly once with the calculation engine's mapping", async () => {
    const app = await createApp({ logger: false, database: { async ping() {}, async close() {} } });
    try {
      const response = await app.inject({ method: "GET", url: "/api/crops" });
      expect(response.statusCode).toBe(200);
      const result = CropModelCapabilitiesResponseSchema.parse(response.json());
      expect(
        result.filter(({ kind }) => kind === "environment-only").map(({ crop }) => crop),
      ).toEqual(["pieczarka"]);
      expect(result.map(({ crop }) => crop).sort()).toEqual(
        CROP_CATALOG.map(({ id }) => id).sort(),
      );
      expect(result.filter(({ profileId }) => profileId !== null)).toHaveLength(
        ARIMR_CROP_PROFILE_MAPPINGS.length,
      );
      for (const mapping of ARIMR_CROP_PROFILE_MAPPINGS) {
        expect(result.find(({ crop }) => crop === mapping.arimrCropId)?.profileId).toBe(
          mapping.profileId,
        );
      }
      expect(result).toEqual(
        expect.arrayContaining([
          { crop: "pszenica-zwyczajna-jara", profileId: "spring-wheat", kind: "species-reference" },
          { crop: "pszenzyto-ozime", profileId: "winter-wheat", kind: "approximate" },
          { crop: "truskawka", profileId: "strawberry", kind: "approximate" },
          { crop: "gryka-tatarka", profileId: "buckwheat", kind: "approximate" },
          { crop: "seradela-uprawna", profileId: "estimated-annual-legume", kind: "approximate" },
          { crop: "pieczarka", profileId: null, kind: "environment-only" },
        ]),
      );
      expect(CropModelCapabilitiesResponseSchema.safeParse(result.slice(1)).success).toBe(false);
      expect(
        CropModelCapabilitiesResponseSchema.safeParse(result.map(() => result[0])).success,
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});
