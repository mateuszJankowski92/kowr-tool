import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClientError, requestJson } from "./request-json";

const ResponseSchema = z.object({ value: z.number() });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("validates and returns a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(requestJson("/api/test", ResponseSchema)).resolves.toEqual({ value: 42 });
  });

  it("preserves a structured API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "PARCEL_NOT_FOUND",
              message: "The parcel could not be found.",
            },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(requestJson("/api/test", ResponseSchema)).rejects.toMatchObject({
      name: "ApiClientError",
      code: "PARCEL_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects a successful response that violates its contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: "not-a-number" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const request = requestJson("/api/test", ResponseSchema);

    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    await expect(request).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
    });
  });
});
