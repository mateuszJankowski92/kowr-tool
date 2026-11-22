import { afterEach, describe, expect, it, vi } from "vitest";
import { historicalWaterAssessment } from "../features/reports/historical-water-assessment.test-fixture";
import {
  createHistoricalWaterAssessmentRequest,
  getHistoricalWaterAssessment,
} from "./historical-analyses";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("historical water assessment API client", () => {
  it("builds a ten-season request that lets the API apply standard phenology", () => {
    expect(
      createHistoricalWaterAssessmentRequest({
        analysisDate: "2025-06-30",
        crop: "pszenica-zwyczajna-jara",
        parcelIdentifier: "141211_2.0038.102",
      }),
    ).toEqual({
      parcel: { type: "identifier", identifier: "141211_2.0038.102" },
      crop: "pszenica-zwyczajna-jara",
      analysisDate: "2025-06-30",
      wettingTiming: "unknown",
    });
  });

  it("uses the supplied sowing date for analogous historical scenarios", () => {
    expect(
      createHistoricalWaterAssessmentRequest({
        analysisDate: "2025-06-30",
        crop: "pszenica-zwyczajna-jara",
        parcelIdentifier: "141211_2.0038.102",
        seasonStartDate: "2025-03-18",
      }),
    ).toMatchObject({
      phenology: {
        method: "fao56-reference",
        seasonStartDates: ["2025-03-18"],
        initialRootDepthMeters: 0.2,
      },
    });
  });

  it("posts the request, forwards cancellation, and validates the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(historicalWaterAssessment), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const request = createHistoricalWaterAssessmentRequest({
      analysisDate: "2025-06-30",
      crop: "pszenica-zwyczajna-jara",
      parcelIdentifier: "141211_2.0038.102",
    });

    await expect(getHistoricalWaterAssessment(request, controller.signal)).resolves.toEqual(
      historicalWaterAssessment,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/historical-analyses",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
        signal: controller.signal,
      }),
    );
  });
});
