import { afterEach, describe, expect, it, vi } from "vitest";
import { completeWaterAssessment } from "../features/reports/water-assessment.test-fixture";
import { createWaterAssessmentRequest, getWaterAssessment } from "./analyses";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("water assessment API client", () => {
  it("builds a request that lets the API apply standard phenology", () => {
    expect(
      createWaterAssessmentRequest({
        analysisDate: "2025-06-30",
        crop: "pszenica-zwyczajna-jara",
        parcelIdentifier: "141201_1.0001.6509",
      }),
    ).toEqual({
      parcel: { type: "identifier", identifier: "141201_1.0001.6509" },
      crop: "pszenica-zwyczajna-jara",
      analysisDate: "2025-06-30",
      wettingTiming: "unknown",
      includeSatellite: true,
    });
  });

  it("sends a known sowing date as an explicit reference scenario", () => {
    expect(
      createWaterAssessmentRequest({
        analysisDate: "2025-06-30",
        crop: "pszenica-zwyczajna-jara",
        parcelIdentifier: "141201_1.0001.6509",
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
      new Response(JSON.stringify(completeWaterAssessment), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const request = createWaterAssessmentRequest({
      analysisDate: "2025-06-30",
      crop: "pszenica-zwyczajna-jara",
      parcelIdentifier: "141201_1.0001.6509",
    });

    await expect(getWaterAssessment(request, controller.signal)).resolves.toEqual(
      completeWaterAssessment,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analyses",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
        signal: controller.signal,
      }),
    );
  });
});
