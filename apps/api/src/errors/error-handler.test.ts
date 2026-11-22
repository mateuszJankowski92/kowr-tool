import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { Database } from "../db/database.js";
import { AppError } from "./app-error.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const database: Database = {
  async ping() {},
  async close() {},
};

describe("API error handling", () => {
  it.each(["/api/soil-profiles", "/api/terrain-contexts", "/api/terrain-textures"])(
    "rejects missing, empty, repeated and unknown query fields for %s",
    async (endpoint) => {
      const parcelLocator = { findByIdentifier: vi.fn(), findByPoint: vi.fn() };
      const app = await createApp({ database, logger: false, parcelLocator });
      openApps.push(app);

      for (const query of [
        "",
        "parcelIdentifier=",
        "parcelIdentifier=%20",
        "parcelIdentifier=one&parcelIdentifier=two",
        "parcelIdentifier=one&unknown=value",
      ]) {
        const response = await app.inject({ method: "GET", url: `${endpoint}?${query}` });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: { code: "INVALID_REQUEST", message: "The request payload is invalid." },
        });
      }
      expect(parcelLocator.findByIdentifier).not.toHaveBeenCalled();
      expect(parcelLocator.findByPoint).not.toHaveBeenCalled();
    },
  );

  it("returns the public error contract for an expected failure", async () => {
    const app = await createApp({ database, logger: false });
    openApps.push(app);
    app.get("/api/test/expected", async () => {
      throw new AppError({
        code: "TEST_CONFLICT",
        message: "The test resource is in conflict.",
        statusCode: 409,
        details: { field: "parcel" },
      });
    });

    const response = await app.inject({ method: "GET", url: "/api/test/expected" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "TEST_CONFLICT",
        message: "The test resource is in conflict.",
        details: { field: "parcel" },
      },
    });
  });

  it("does not expose details of an unexpected failure", async () => {
    const app = await createApp({ database, logger: false });
    openApps.push(app);
    app.get("/api/test/unexpected", async () => {
      throw new Error("provider secret must not escape");
    });

    const response = await app.inject({ method: "GET", url: "/api/test/unexpected" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
    expect(response.body).not.toContain("provider secret");
  });

  it("uses the public error contract for unknown routes", async () => {
    const app = await createApp({ database, logger: false });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/not-a-route" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested endpoint does not exist.",
      },
    });
  });
});
