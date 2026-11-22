import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];
const database: Database = { async ping() {}, async close() {} };

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("recommendation routes", () => {
  it("returns only actions supported by the submitted analysis context", async () => {
    const app = await createApp({ database, logger: false });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/recommendations",
      payload: {
        crop: "pszenica-zwyczajna-jara",
        cropPeriod: "active-season",
        water: {
          status: "complete",
          classification: "elevated-shortage-risk",
          maximumStressDays: 9,
          maximumEvapotranspirationDeficitMm: 22,
        },
        soil: {
          status: "complete",
          topsoilOrganicCarbonGramsPerKilogram: 13,
          availableWaterCapacityMillimeters: 84,
        },
        terrain: {
          status: "available",
          typicalSlopeDegrees: 2,
          elevationRangeMeters: 3,
        },
        hydrology: {
          status: "available",
          intersectsParcel: false,
          nearestDistanceMeters: 70,
        },
        landUse: {
          status: "available",
          dominantClass: "agriculture",
          coveragePercent: 88,
        },
        satellite: { consistency: "not-qualified" },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("partial");
    expect(body.items).toEqual(
      expect.arrayContaining(
        [
          { id: "protect-soil-surface", category: "agronomic", priority: "high" },
          { id: "review-contour-practices", category: "retention", priority: "high" },
        ].map((item) => expect.objectContaining(item)),
      ),
    );
  });

  it("rejects unknown request fields", async () => {
    const app = await createApp({ database, logger: false });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/recommendations",
      payload: { unexpected: true },
    });

    expect(response.statusCode).toBe(400);
  });
});
