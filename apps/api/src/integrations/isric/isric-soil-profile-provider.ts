import { SOIL_PROFILE_DEPTH_INTERVALS } from "@kowr/analysis";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import {
  type ProvidedSoilProfile,
  type SoilProfileLayer,
  type SoilProfilePrediction,
  type SoilProfileProvider,
  SoilProfileProviderError,
} from "../../features/soil-profiles/soil-profile-provider.js";

const SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const SOILGRIDS_PROPERTIES = [
  "sand",
  "silt",
  "clay",
  "soc",
  "phh2o",
  "bdod",
  "wv0010",
  "wv0033",
  "wv1500",
] as const;
const SOILGRIDS_QUANTILES = ["Q0.05", "Q0.5", "Q0.95"] as const;

const SoilGridsPredictionSchema = z
  .object({
    "Q0.05": z.number().nullable(),
    "Q0.5": z.number().nullable(),
    "Q0.95": z.number().nullable(),
  })
  .passthrough();

const SoilGridsDepthSchema = z
  .object({
    range: z
      .object({
        top_depth: z.number().int().nonnegative(),
        bottom_depth: z.number().int().positive(),
        unit_depth: z.literal("cm"),
      })
      .passthrough(),
    values: SoilGridsPredictionSchema,
  })
  .passthrough();

const SoilGridsLayerSchema = z
  .object({
    name: z.enum(SOILGRIDS_PROPERTIES),
    unit_measure: z
      .object({
        d_factor: z.number().positive(),
        target_units: z.string(),
      })
      .passthrough(),
    depths: z.array(SoilGridsDepthSchema),
  })
  .passthrough();

const SoilGridsResponseSchema = z
  .object({
    properties: z
      .object({
        layers: z.array(SoilGridsLayerSchema),
      })
      .passthrough(),
  })
  .passthrough();

type SoilGridsLayer = z.infer<typeof SoilGridsLayerSchema>;
type SoilGridsProperty = (typeof SOILGRIDS_PROPERTIES)[number];

const propertyFactors: Record<SoilGridsProperty, number> = {
  sand: 10,
  silt: 10,
  clay: 10,
  soc: 10,
  phh2o: 10,
  bdod: 100,
  wv0010: 10,
  wv0033: 10,
  wv1500: 10,
};

type IsricSoilProfileProviderOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

function createRequestUrl(longitude: number, latitude: number): URL {
  const url = new URL(SOILGRIDS_URL);
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("lat", String(latitude));

  for (const property of SOILGRIDS_PROPERTIES) url.searchParams.append("property", property);
  for (const quantile of SOILGRIDS_QUANTILES) url.searchParams.append("value", quantile);

  return url;
}

function findLayer(layers: SoilGridsLayer[], property: SoilGridsProperty): SoilGridsLayer | null {
  const matches = layers.filter((layer) => layer.name === property);
  if (matches.length > 1) throw new SoilProfileProviderError("INVALID_RESPONSE");
  return matches[0] ?? null;
}

function mapPrediction(
  layers: SoilGridsLayer[],
  property: SoilGridsProperty,
  topDepthCm: number,
  bottomDepthCm: number,
): SoilProfilePrediction {
  const layer = findLayer(layers, property);
  if (!layer) return { q05: null, q50: null, q95: null };

  const expectedFactor = propertyFactors[property];
  if (layer.unit_measure.d_factor !== expectedFactor) {
    throw new SoilProfileProviderError("INVALID_RESPONSE");
  }

  const matches = layer.depths.filter(
    ({ range }) =>
      range.top_depth === topDepthCm &&
      range.bottom_depth === bottomDepthCm &&
      range.unit_depth === "cm",
  );
  if (matches.length > 1) throw new SoilProfileProviderError("INVALID_RESPONSE");

  const values = matches[0]?.values;
  if (!values) return { q05: null, q50: null, q95: null };

  const convert = (value: number | null) => (value === null ? null : value / expectedFactor);
  const prediction = {
    q05: convert(values["Q0.05"]),
    q50: convert(values["Q0.5"]),
    q95: convert(values["Q0.95"]),
  };

  if (
    prediction.q05 !== null &&
    prediction.q50 !== null &&
    prediction.q95 !== null &&
    (prediction.q05 > prediction.q50 || prediction.q50 > prediction.q95)
  ) {
    throw new SoilProfileProviderError("INVALID_RESPONSE");
  }

  return prediction;
}

function mapLayer(
  layers: SoilGridsLayer[],
  { topDepthCm, bottomDepthCm }: (typeof SOIL_PROFILE_DEPTH_INTERVALS)[number],
): SoilProfileLayer {
  return {
    topDepthCm,
    bottomDepthCm,
    sandPercent: mapPrediction(layers, "sand", topDepthCm, bottomDepthCm),
    siltPercent: mapPrediction(layers, "silt", topDepthCm, bottomDepthCm),
    clayPercent: mapPrediction(layers, "clay", topDepthCm, bottomDepthCm),
    soilOrganicCarbonGramsPerKilogram: mapPrediction(layers, "soc", topDepthCm, bottomDepthCm),
    ph: mapPrediction(layers, "phh2o", topDepthCm, bottomDepthCm),
    bulkDensityKilogramsPerCubicDecimeter: mapPrediction(layers, "bdod", topDepthCm, bottomDepthCm),
    waterContent10KpaPercent: mapPrediction(layers, "wv0010", topDepthCm, bottomDepthCm),
    waterContent33KpaPercent: mapPrediction(layers, "wv0033", topDepthCm, bottomDepthCm),
    waterContent1500KpaPercent: mapPrediction(layers, "wv1500", topDepthCm, bottomDepthCm),
  };
}

function mapResponse(payload: unknown, retrievedAt: string): ProvidedSoilProfile {
  const parsed = SoilGridsResponseSchema.safeParse(payload);
  if (!parsed.success) throw new SoilProfileProviderError("INVALID_RESPONSE", parsed.error);

  const sourceLayers = parsed.data.properties.layers;
  return {
    layers: [
      mapLayer(sourceLayers, SOIL_PROFILE_DEPTH_INTERVALS[0]),
      mapLayer(sourceLayers, SOIL_PROFILE_DEPTH_INTERVALS[1]),
      mapLayer(sourceLayers, SOIL_PROFILE_DEPTH_INTERVALS[2]),
      mapLayer(sourceLayers, SOIL_PROFILE_DEPTH_INTERVALS[3]),
      mapLayer(sourceLayers, SOIL_PROFILE_DEPTH_INTERVALS[4]),
      mapLayer(sourceLayers, SOIL_PROFILE_DEPTH_INTERVALS[5]),
    ],
    retrievedAt,
    sourceUrl: SOILGRIDS_URL,
  };
}

export function createIsricSoilProfileProvider(
  options: IsricSoilProfileProviderOptions,
): SoilProfileProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    async getProfile(longitude, latitude, signal) {
      const startedAt = performance.now();
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      try {
        const response = await fetchImplementation(createRequestUrl(longitude, latitude), {
          headers: { Accept: "application/json" },
          signal: requestSignal,
        });
        if (!response.ok) throw new SoilProfileProviderError("REQUEST_FAILED");

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          throw new SoilProfileProviderError("INVALID_RESPONSE", error);
        }

        return mapResponse(payload, now().toISOString());
      } catch (error) {
        const providerError =
          error instanceof SoilProfileProviderError
            ? error
            : new SoilProfileProviderError(
                timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
                error,
              );

        options.logger.warn(
          {
            provider: "ISRIC SoilGrids",
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: `SOILGRIDS_${providerError.code}`,
          },
          "Soil profile provider request failed",
        );
        throw providerError;
      }
    },
  };
}
