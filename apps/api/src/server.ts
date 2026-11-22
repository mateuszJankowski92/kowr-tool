import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = await createApp();

let isShuttingDown = false;

async function shutDown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;

  isShuttingDown = true;
  app.log.info({ signal }, "Shutting down API");

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Failed to shut down API cleanly");
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutDown("SIGINT"));
process.once("SIGTERM", () => void shutDown("SIGTERM"));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
