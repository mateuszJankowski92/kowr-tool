import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
config({ quiet: true });

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().default("postgresql://kowr:kowr@localhost:5432/kowr"),
  MIGRATIONS_DIRECTORY: z.string().min(1).optional(),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  CDSE_CLIENT_ID: z.string().optional(),
  CDSE_CLIENT_SECRET: z.string().optional(),
});

export const env = EnvironmentSchema.parse(process.env);
