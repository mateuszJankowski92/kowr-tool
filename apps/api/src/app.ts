import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { type Database, PostgresDatabase } from "./db/database.js";
import { registerErrorHandling } from "./errors/error-handler.js";
import { createHealthRoutes } from "./routes/health.js";

type CreateAppOptions = {
  database?: Database;
  logger?: boolean;
};

export async function createApp(options: CreateAppOptions = {}) {
  const database = options.database ?? new PostgresDatabase();
  const app = Fastify({ logger: options.logger ?? true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "KOWR Water Assistant API",
        description: "API wspierające analizę sytuacji wodnej działek rolnych.",
        version: "0.1.0",
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(createHealthRoutes(database), { prefix: "/api" });

  app.addHook("onClose", async () => {
    await database.close();
  });

  return app;
}
