import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { CropDetector } from "./crop-detector.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

const cropDetector: CropDetector = {
  async findIntersections() {
    return {
      complete: true,
      intersections: [
        {
          overlapAreaSquareMeters: 80,
          sourceGroup: "zboża",
          sourceLabel: "pszenica zwyczajna ozima",
        },
      ],
      parcelAreaSquareMeters: 100,
      retrievedAt: "2026-11-21T12:00:00.000Z",
    };
  },
};

describe("POST /api/crop-detections", () => {
  it("returns a crop suggestion for a parcel geometry", async () => {
    const app = await createApp({ cropDetector, database, logger: false });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/crop-detections",
      payload: {
        parcelIdentifier: "141201_1.0001.6509",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [21.5, 52.1],
              [21.6, 52.1],
              [21.6, 52.2],
              [21.5, 52.1],
            ],
          ],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "suggested",
      candidates: [{ crop: "pszenica-zwyczajna-ozima", overlapPercent: 80 }],
      provenance: { provider: "ARiMR GSA", campaign: 2025 },
    });
  });
});
