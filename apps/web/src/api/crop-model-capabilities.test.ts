import { afterEach, describe, expect, it, vi } from "vitest";
import { getCropModelCapabilities } from "./crop-model-capabilities";
import { cropModelCapabilitiesFixture } from "./crop-model-capabilities.test-fixture";

afterEach(() => vi.unstubAllGlobals());

describe("crop model capability client", () => {
  it("validates the complete catalog and forwards cancellation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(cropModelCapabilitiesFixture)));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await getCropModelCapabilities(signal)).toEqual(cropModelCapabilitiesFixture);
    expect(fetchMock).toHaveBeenCalledWith("/api/crops", expect.objectContaining({ signal }));
  });

  it.each([
    { payload: [] },
    { payload: cropModelCapabilitiesFixture.slice(1) },
    { payload: cropModelCapabilitiesFixture.map(() => cropModelCapabilitiesFixture[0]) },
    { payload: cropModelCapabilitiesFixture.map((entry) => ({ ...entry, extra: true })) },
  ])("rejects incomplete or invalid metadata instead of guessing support", async ({ payload }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    await expect(getCropModelCapabilities()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
