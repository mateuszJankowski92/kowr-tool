import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { Database } from "../db/database.js";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

function fakeDatabase(available: boolean): Database {
  return {
    async ping() {
      if (!available) throw new Error("Database unavailable");
    },
    async close() {},
  };
}

describe("GET /api/health", () => {
  it("reports a healthy API and database", async () => {
    const app = await createApp({ database: fakeDatabase(true), logger: false });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", database: "connected" });
  });

  it("reports degraded state when Postgres is unavailable", async () => {
    const app = await createApp({ database: fakeDatabase(false), logger: false });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "degraded",
      database: "unavailable",
    });
  });
});
