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
import { createAnalysisRoutes } from "./features/analyses/analysis.routes.js";
import { createCropRoutes } from "./features/crops/crop.routes.js";
import { createCropDetectionRoutes } from "./features/crops/crop-detection.routes.js";
import type { CropDetector } from "./features/crops/crop-detector.js";
import { createHistoricalAnalysisRoutes } from "./features/historical-analyses/historical-analysis.routes.js";
import { createCachedParcelLocator } from "./features/parcels/cached-parcel-locator.js";
import { createParcelRoutes } from "./features/parcels/parcel.routes.js";
import type { ParcelLocator } from "./features/parcels/parcel-locator.js";
import { createRecommendationRoutes } from "./features/recommendations/recommendation.routes.js";
import { createSatelliteHistoryRoutes } from "./features/satellite-history/satellite-history.routes.js";
import type { SatelliteHistoryProvider } from "./features/satellite-history/satellite-history-provider.js";
import { createSoilProfileRoutes } from "./features/soil-profiles/soil-profile.routes.js";
import type { SoilProfileProvider } from "./features/soil-profiles/soil-profile-provider.js";
import { createCachedTerrainProvider } from "./features/terrain-context/cached-terrain-provider.js";
import type { SurroundingsProvider } from "./features/terrain-context/surroundings-provider.js";
import { createTerrainContextRoutes } from "./features/terrain-context/terrain-context.routes.js";
import type {
  TerrainProvider,
  TerrainTextureProvider,
} from "./features/terrain-context/terrain-provider.js";
import { createWeatherConditionsRoutes } from "./features/weather-conditions/weather-conditions.routes.js";
import type { WeatherConditionsProvider } from "./features/weather-conditions/weather-conditions-provider.js";
import { createGsaCropDetector } from "./integrations/arimr/gsa-crop-detector.js";
import { createCdseSatelliteProvider } from "./integrations/copernicus/cdse-satellite-provider.js";
import { createEgibWfsParcelLocator } from "./integrations/gugik/egib-wfs-parcel-locator.js";
import { createGugikParcelLocator } from "./integrations/gugik/gugik-parcel-locator.js";
import { createGugikTerrainProvider } from "./integrations/gugik/gugik-terrain-provider.js";
import { createUldkParcelLocator } from "./integrations/gugik/uldk-parcel-locator.js";
import { createIsricWmsSoilProfileProvider } from "./integrations/isric/isric-wms-soil-profile-provider.js";
import { createNasaPowerWeatherProvider } from "./integrations/nasa-power/nasa-power-weather-provider.js";
import { createOpenMeteoWeatherProvider } from "./integrations/open-meteo/open-meteo-weather-provider.js";
import { createOpenStreetMapSurroundingsProvider } from "./integrations/openstreetmap/openstreetmap-surroundings-provider.js";
import { createHealthRoutes } from "./routes/health.js";

type CreateAppOptions = {
  clock?: () => Date;
  cropDetector?: CropDetector;
  database?: Database;
  logger?: boolean;
  parcelLocator?: ParcelLocator;
  satelliteHistoryProvider?: SatelliteHistoryProvider;
  soilProfileProvider?: SoilProfileProvider;
  surroundingsProvider?: SurroundingsProvider;
  terrainProvider?: TerrainProvider;
  terrainTextureProvider?: TerrainTextureProvider;
  weatherFallbackProvider?: WeatherConditionsProvider;
  weatherPrimaryProvider?: WeatherConditionsProvider;
  weatherRecentProvider?: WeatherConditionsProvider;
};

export async function createApp(options: CreateAppOptions = {}) {
  const database = options.database ?? new PostgresDatabase();
  const app = Fastify({ logger: options.logger ?? true });
  const cropDetector = options.cropDetector ?? createGsaCropDetector({ logger: app.log });
  const parcelLocator =
    options.parcelLocator ??
    createCachedParcelLocator(
      createGugikParcelLocator(
        createUldkParcelLocator({ logger: app.log }),
        createEgibWfsParcelLocator({ logger: app.log }),
      ),
      options.clock ?? (() => new Date()),
    );
  const satelliteHistoryProvider =
    options.satelliteHistoryProvider ??
    createCdseSatelliteProvider({
      clientId: env.CDSE_CLIENT_ID,
      clientSecret: env.CDSE_CLIENT_SECRET,
      logger: app.log,
    });
  const soilProfileProvider =
    options.soilProfileProvider ??
    createIsricWmsSoilProfileProvider({
      logger: app.log,
      persistentCache: database.soilProfilePropertyCache,
    });
  const defaultTerrainProvider = createGugikTerrainProvider({ logger: app.log });
  const terrainProvider = createCachedTerrainProvider(
    options.terrainProvider ?? defaultTerrainProvider,
    options.clock ?? (() => new Date()),
  );
  const terrainTextureProvider = options.terrainTextureProvider ?? defaultTerrainProvider;
  const surroundingsProvider =
    options.surroundingsProvider ?? createOpenStreetMapSurroundingsProvider({ logger: app.log });
  const weatherPrimaryProvider =
    options.weatherPrimaryProvider ?? createOpenMeteoWeatherProvider({ logger: app.log });
  const weatherFallbackProvider =
    options.weatherFallbackProvider ?? createNasaPowerWeatherProvider({ logger: app.log });
  const weatherRecentProvider =
    options.weatherRecentProvider ??
    (options.weatherPrimaryProvider
      ? undefined
      : createOpenMeteoWeatherProvider({ logger: app.log, model: "ecmwf_ifs", timeoutMs: 8_000 }));

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "HydroPlon API",
        description: "API wspierające analizę sytuacji wodnej działek rolnych.",
        version: "0.1.0",
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(createHealthRoutes(database), { prefix: "/api" });
  await app.register(
    createAnalysisRoutes({
      parcelLocator,
      soilProfileProvider,
      weatherPrimaryProvider,
      weatherFallbackProvider,
      weatherRecentProvider,
      satelliteHistoryProvider,
      clock: options.clock ?? (() => new Date()),
    }),
    { prefix: "/api" },
  );
  await app.register(
    createHistoricalAnalysisRoutes({
      parcelLocator,
      soilProfileProvider,
      weatherPrimaryProvider,
      weatherFallbackProvider,
      weatherRecentProvider,
      clock: options.clock ?? (() => new Date()),
    }),
    { prefix: "/api" },
  );
  await app.register(createParcelRoutes(parcelLocator), { prefix: "/api" });
  await app.register(createRecommendationRoutes(), { prefix: "/api" });
  await app.register(createCropDetectionRoutes(cropDetector), { prefix: "/api" });
  await app.register(createCropRoutes(), { prefix: "/api" });
  await app.register(createSatelliteHistoryRoutes(satelliteHistoryProvider), { prefix: "/api" });
  await app.register(createSoilProfileRoutes(parcelLocator, soilProfileProvider), {
    prefix: "/api",
  });
  await app.register(
    createTerrainContextRoutes(
      parcelLocator,
      terrainProvider,
      terrainTextureProvider,
      surroundingsProvider,
    ),
    { prefix: "/api" },
  );
  await app.register(
    createWeatherConditionsRoutes(weatherPrimaryProvider, weatherFallbackProvider),
    { prefix: "/api" },
  );

  app.addHook("onClose", async () => {
    await database.close();
  });

  return app;
}
