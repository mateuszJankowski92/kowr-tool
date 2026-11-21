import { HealthResponseSchema } from "@kowr/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Database } from "../db/database.js";

export function createHealthRoutes(database: Database): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/health",
      {
        schema: {
          tags: ["system"],
          summary: "Check API and database availability",
          response: {
            200: HealthResponseSchema,
            503: HealthResponseSchema,
          },
        },
      },
      async (_request, reply) => {
        try {
          await database.ping();
          return {
            status: "ok" as const,
            database: "connected" as const,
            timestamp: new Date().toISOString(),
            version: "0.1.0",
          };
        } catch {
          return reply.status(503).send({
            status: "degraded",
            database: "unavailable",
            timestamp: new Date().toISOString(),
            version: "0.1.0",
          });
        }
      },
    );
  };
}
