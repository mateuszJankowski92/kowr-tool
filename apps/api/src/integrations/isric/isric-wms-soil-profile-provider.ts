import { SOIL_PROFILE_DEPTH_INTERVALS } from "@kowr/analysis";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { SoilProfilePropertyCache } from "../../features/soil-profiles/soil-profile-property-cache.js";
import {
  type SoilProfileLayers,
  type SoilProfilePrediction,
  type SoilProfileProvider,
  SoilProfileProviderError,
} from "../../features/soil-profiles/soil-profile-provider.js";

const SOILGRIDS_WMS_URL = "https://maps.isric.org/mapserv";
const QUANTILES = ["Q0.05", "Q0.5", "Q0.95"] as const;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETRY_COUNT = 1;
const MAX_CACHE_ENTRIES = 512;
const MAX_RETRY_DELAY_MS = 2_000;
const MAX_CONCURRENT_RECOVERY_REQUESTS = 6;

const PROPERTIES = [
  { id: "sand", field: "sandPercent", divisor: 10, units: ["g/kg"] },
  { id: "silt", field: "siltPercent", divisor: 10, units: ["g/kg"] },
  { id: "clay", field: "clayPercent", divisor: 10, units: ["g/kg"] },
  {
    id: "soc",
    field: "soilOrganicCarbonGramsPerKilogram",
    divisor: 10,
    units: ["dg/kg"],
  },
  { id: "phh2o", field: "ph", divisor: 10, units: ["pH*10", "pH x 10"] },
  {
    id: "bdod",
    field: "bulkDensityKilogramsPerCubicDecimeter",
    divisor: 100,
    units: ["cg/cm³", "cg/cm3"],
  },
  {
    id: "wv0010",
    field: "waterContent10KpaPercent",
    divisor: 10,
    units: null,
  },
  {
    id: "wv0033",
    field: "waterContent33KpaPercent",
    divisor: 10,
    units: null,
  },
  {
    id: "wv1500",
    field: "waterContent1500KpaPercent",
    divisor: 10,
    units: null,
  },
] as const;

type SoilGridsProperty = (typeof PROPERTIES)[number];
const WATER_PROPERTIES = PROPERTIES.filter(({ id }) => id.startsWith("wv"));

type PropertyResult = {
  predictions: SoilProfilePrediction[];
  retrievedAt: string;
};

type PropertyCacheEntry = {
  controller: AbortController;
  consumers: number;
  expiresAt: number;
  promise: Promise<PropertyResult>;
  settled: boolean;
};

class SoilGridsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number,
  ) {
    super(`SoilGrids WMS returned HTTP ${status}.`);
    this.name = "SoilGridsHttpError";
  }
}

function retryDelayMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000));
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? 0
    : Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - Date.now()));
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

class SoilGridsEmptyResponseError extends Error {
  constructor() {
    super("SoilGrids WMS returned an empty response body.");
    this.name = "SoilGridsEmptyResponseError";
  }
}

class SoilGridsServiceExceptionError extends Error {
  constructor() {
    super("SoilGrids WMS could not read one or more requested raster layers.");
    this.name = "SoilGridsServiceExceptionError";
  }
}

const FeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z
          .object({
            properties: z
              .object({
                pixel_value: z.number().nullable(),
                unit: z.string(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(1),
  })
  .passthrough();

type IsricWmsSoilProfileProviderOptions = {
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
  cacheTtlMs?: number;
  retryCount?: number;
  persistentCache?: SoilProfilePropertyCache;
};

function locationKey(longitude: number, latitude: number): string {
  return `epsg4326:${longitude.toFixed(6)}:${latitude.toFixed(6)}`;
}

function cacheUnit(property: SoilGridsProperty): string {
  if (property.id.startsWith("wv")) return "10^-2 cm3/cm3 (volumetric percent)";
  return property.units?.[0] ?? "property-specific mapped unit";
}

function isCompletePredictionSet(predictions: readonly SoilProfilePrediction[]): boolean {
  return (
    predictions.length === SOIL_PROFILE_DEPTH_INTERVALS.length &&
    predictions.every(({ q05, q50, q95 }) => q05 !== null && q50 !== null && q95 !== null)
  );
}

function layerNames(property: SoilGridsProperty): string[] {
  return SOIL_PROFILE_DEPTH_INTERVALS.flatMap(({ topDepthCm, bottomDepthCm }) =>
    QUANTILES.map((quantile) => `${property.id}_${topDepthCm}-${bottomDepthCm}cm_${quantile}`),
  );
}

function createRequestUrl(
  property: SoilGridsProperty,
  longitude: number,
  latitude: number,
  layers = layerNames(property),
): URL {
  const url = new URL(`${SOILGRIDS_WMS_URL}/${property.id}`);
  const halfSpanDegrees = 0.01;
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetFeatureInfo");
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set(
    "BBOX",
    [
      longitude - halfSpanDegrees,
      latitude - halfSpanDegrees,
      longitude + halfSpanDegrees,
      latitude + halfSpanDegrees,
    ].join(","),
  );
  url.searchParams.set("WIDTH", "101");
  url.searchParams.set("HEIGHT", "101");
  url.searchParams.set("X", "50");
  url.searchParams.set("Y", "50");
  url.searchParams.set("LAYERS", layers.join(","));
  url.searchParams.set("STYLES", layers.map(() => "default").join(","));
  url.searchParams.set("QUERY_LAYERS", layers.join(","));
  url.searchParams.set("INFO_FORMAT", "application/geo+json");
  url.searchParams.set("FEATURE_COUNT", "1");
  url.searchParams.set("FORMAT", "image/png");
  return url;
}

function parseJsonDocuments(payload: string): unknown[] {
  const documents: unknown[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    if (start === -1) {
      if (/\s/.test(character ?? "")) continue;
      if (character !== "{") throw new SoilProfileProviderError("INVALID_RESPONSE");
      start = index;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;

    if (depth === 0) {
      try {
        documents.push(JSON.parse(payload.slice(start, index + 1)));
      } catch (error) {
        throw new SoilProfileProviderError("INVALID_RESPONSE", error);
      }
      start = -1;
    }
  }

  if (start !== -1 || documents.length === 0) {
    throw new SoilProfileProviderError("INVALID_RESPONSE");
  }
  return documents;
}

function mapFeatureInfoValues(
  payload: string,
  property: SoilGridsProperty,
  expectedDocumentCount: number,
): (number | null)[] {
  if (payload.trim().length === 0) throw new SoilGridsEmptyResponseError();
  if (payload.trimStart().startsWith("<") && /(?:ServiceException|ExceptionReport)/.test(payload)) {
    throw new SoilGridsServiceExceptionError();
  }
  const documents = parseJsonDocuments(payload);
  if (documents.length !== expectedDocumentCount) {
    throw new SoilProfileProviderError("INVALID_RESPONSE");
  }

  return documents.map((document) => {
    const parsed = FeatureCollectionSchema.safeParse(document);
    if (!parsed.success) throw new SoilProfileProviderError("INVALID_RESPONSE", parsed.error);
    const feature = parsed.data.features[0];
    if (!feature || feature.properties.pixel_value === null) return null;
    // ISRIC currently reports copied texture units for the water-retention WMS layers.
    // Their documented property-specific scale is stable, so water units are mapped by id.
    if (
      property.units &&
      !(property.units as readonly string[]).includes(feature.properties.unit)
    ) {
      throw new SoilProfileProviderError("INVALID_RESPONSE");
    }
    return feature.properties.pixel_value / property.divisor;
  });
}

function mapPropertyResponse(
  payload: string,
  property: SoilGridsProperty,
): SoilProfilePrediction[] {
  const values = mapFeatureInfoValues(
    payload,
    property,
    SOIL_PROFILE_DEPTH_INTERVALS.length * QUANTILES.length,
  );

  return SOIL_PROFILE_DEPTH_INTERVALS.map((_, depthIndex) => {
    const valueIndex = depthIndex * QUANTILES.length;
    const quantileValues = values.slice(valueIndex, valueIndex + QUANTILES.length);
    if (quantileValues.every((value) => value === null)) return emptyPrediction();

    // MapServer returns layers in map-file order and currently repeats the first layer id in
    // every GeoJSON document. Quantiles remain mathematically ordered, so sorting a complete
    // depth triplet avoids relying on that provider bug. An incomplete triplet is ambiguous.
    if (quantileValues.some((value) => value === null)) return emptyPrediction();
    const [q05, q50, q95] = (quantileValues as number[]).toSorted((left, right) => left - right);
    return { q05: q05 ?? null, q50: q50 ?? null, q95: q95 ?? null };
  });
}

function emptyPrediction(): SoilProfilePrediction {
  return { q05: null, q50: null, q95: null };
}

export function createIsricWmsSoilProfileProvider(
  options: IsricWmsSoilProfileProviderOptions,
): SoilProfileProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 12_000;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const propertyCache = new Map<string, PropertyCacheEntry>();

  const activeRecoveryRequests = new Set<Promise<number | null>>();

  const requestRecoveryValue = async (
    property: SoilGridsProperty,
    longitude: number,
    latitude: number,
    layer: string,
    signal: AbortSignal,
  ): Promise<number | null> => {
    while (activeRecoveryRequests.size >= MAX_CONCURRENT_RECOVERY_REQUESTS) {
      signal.throwIfAborted();
      await Promise.race(
        Array.from(activeRecoveryRequests, (request) =>
          request.then(
            () => undefined,
            () => undefined,
          ),
        ),
      );
    }
    signal.throwIfAborted();
    const request = (async () => {
      const response = await fetchImplementation(
        createRequestUrl(property, longitude, latitude, [layer]),
        {
          headers: { Accept: "application/geo+json" },
          signal,
        },
      );
      if (!response.ok) throw new SoilGridsHttpError(response.status, 0);
      return mapFeatureInfoValues(await response.text(), property, 1)[0] ?? null;
    })();
    activeRecoveryRequests.add(request);
    try {
      return await request;
    } finally {
      activeRecoveryRequests.delete(request);
    }
  };

  const recoverIndividualLayers = async (
    property: SoilGridsProperty,
    longitude: number,
    latitude: number,
    signal: AbortSignal,
  ): Promise<PropertyResult> => {
    const startedAt = performance.now();
    const recoverySignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    const predictions = SOIL_PROFILE_DEPTH_INTERVALS.map(() => emptyPrediction());
    const readQuantile = async (depthIndex: number, quantile: (typeof QUANTILES)[number]) => {
      const depth = SOIL_PROFILE_DEPTH_INTERVALS[depthIndex];
      const prediction = predictions[depthIndex];
      if (!depth || !prediction) return;
      const value = await requestRecoveryValue(
        property,
        longitude,
        latitude,
        `${property.id}_${depth.topDepthCm}-${depth.bottomDepthCm}cm_${quantile}`,
        recoverySignal,
      );
      const field = { "Q0.05": "q05", "Q0.5": "q50", "Q0.95": "q95" } as const;
      prediction[field[quantile]] = value;
    };
    // Recover model inputs first. A broken uncertainty raster must not discard its valid median.
    await Promise.allSettled(predictions.map((_, depthIndex) => readQuantile(depthIndex, "Q0.5")));
    if (predictions.some(({ q50 }) => q50 !== null)) {
      await Promise.allSettled(
        predictions.flatMap((_, depthIndex) => [
          readQuantile(depthIndex, "Q0.05"),
          readQuantile(depthIndex, "Q0.95"),
        ]),
      );
    }
    signal.throwIfAborted();
    const recoveredValueCount = predictions.reduce(
      (count, prediction) =>
        count + Object.values(prediction).filter((value) => value !== null).length,
      0,
    );
    options.logger.warn(
      {
        provider: "ISRIC SoilGrids WMS",
        property: property.id,
        durationMs: Math.round(performance.now() - startedAt),
        errorCode: "SOILGRIDS_WMS_LAYER_RECOVERY",
        recoveredValueCount,
        expectedValueCount: predictions.length * QUANTILES.length,
      },
      "Recovered soil profile from independent raster-layer requests",
    );
    if (recoveredValueCount === 0) throw new SoilProfileProviderError("REQUEST_FAILED");
    return { predictions, retrievedAt: now().toISOString() };
  };

  const requestProperty = async (
    property: SoilGridsProperty,
    longitude: number,
    latitude: number,
    signal: AbortSignal,
  ): Promise<PropertyResult> => {
    let lastError = new SoilProfileProviderError("REQUEST_FAILED");

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const startedAt = performance.now();
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const requestSignal = AbortSignal.any([signal, timeoutSignal]);

      try {
        const response = await fetchImplementation(
          createRequestUrl(property, longitude, latitude),
          {
            headers: { Accept: "application/geo+json" },
            signal: requestSignal,
          },
        );
        if (!response.ok) throw new SoilGridsHttpError(response.status, retryDelayMs(response));
        return {
          predictions: mapPropertyResponse(await response.text(), property),
          retrievedAt: now().toISOString(),
        };
      } catch (error) {
        if (signal.aborted) throw error;
        if (
          error instanceof SoilGridsServiceExceptionError ||
          (error instanceof SoilGridsEmptyResponseError && attempt === retryCount)
        ) {
          return recoverIndividualLayers(property, longitude, latitude, signal);
        }
        const providerError =
          error instanceof SoilProfileProviderError
            ? error
            : new SoilProfileProviderError(
                timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
                error,
              );
        const retryable =
          providerError.code === "TIMEOUT" ||
          (providerError.code === "REQUEST_FAILED" &&
            (!(error instanceof SoilGridsHttpError) ||
              error.status === 429 ||
              error.status >= 500));
        const willRetry = retryable && attempt < retryCount;
        options.logger.warn(
          {
            provider: "ISRIC SoilGrids WMS",
            property: property.id,
            attempt: attempt + 1,
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: `SOILGRIDS_WMS_${providerError.code}`,
            willRetry,
          },
          "Soil profile property request failed",
        );
        lastError = providerError;
        if (!willRetry) throw providerError;
        if (error instanceof SoilGridsHttpError) {
          await waitForRetry(error.retryAfterMs, signal);
        }
      }
    }

    throw lastError;
  };

  const releaseConsumer = (entry: PropertyCacheEntry) => {
    entry.consumers -= 1;
    if (entry.consumers === 0 && !entry.settled) entry.controller.abort();
  };

  const consumeEntry = (entry: PropertyCacheEntry, signal?: AbortSignal) => {
    entry.consumers += 1;
    if (signal?.aborted) {
      releaseConsumer(entry);
      return Promise.reject(signal.reason);
    }

    return new Promise<PropertyResult>((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        signal?.removeEventListener("abort", onAbort);
        releaseConsumer(entry);
      };
      const onAbort = () => {
        release();
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      entry.promise.then(
        (value) => {
          release();
          resolve(value);
        },
        (error: unknown) => {
          release();
          reject(error);
        },
      );
    });
  };

  const getProperty = (
    property: SoilGridsProperty,
    longitude: number,
    latitude: number,
    signal?: AbortSignal,
  ): Promise<PropertyResult> => {
    const key = `${property.id}:${longitude.toFixed(6)}:${latitude.toFixed(6)}`;
    const cached = propertyCache.get(key);
    if (cached && cached.expiresAt > performance.now()) return consumeEntry(cached, signal);
    if (cached) propertyCache.delete(key);

    const controller = new AbortController();
    const entry: PropertyCacheEntry = {
      controller,
      consumers: 0,
      expiresAt: performance.now() + cacheTtlMs,
      promise: Promise.resolve({ predictions: [], retrievedAt: "" }),
      settled: false,
    };
    entry.promise = (async () => {
      const key = { locationKey: locationKey(longitude, latitude), property: property.id };
      if (options.persistentCache) {
        try {
          const cachedProperty = await options.persistentCache.find(key);
          if (cachedProperty && isCompletePredictionSet(cachedProperty.predictions)) {
            return {
              predictions: cachedProperty.predictions,
              retrievedAt: cachedProperty.retrievedAt,
            };
          }
        } catch {
          options.logger.warn(
            {
              provider: "ISRIC SoilGrids WMS",
              property: property.id,
              errorCode: "CACHE_READ_FAILED",
            },
            "Soil profile cache read failed",
          );
        }
      }

      const result = await requestProperty(property, longitude, latitude, controller.signal);
      if (options.persistentCache && isCompletePredictionSet(result.predictions)) {
        try {
          await options.persistentCache.store({
            ...key,
            longitude,
            latitude,
            predictions: result.predictions,
            product: "SoilGrids250m",
            productVersion: "2.0",
            resolutionMeters: 250,
            unit: cacheUnit(property),
            sourceUrl: SOILGRIDS_WMS_URL,
            retrievedAt: result.retrievedAt,
          });
        } catch {
          options.logger.warn(
            {
              provider: "ISRIC SoilGrids WMS",
              property: property.id,
              errorCode: "CACHE_WRITE_FAILED",
            },
            "Soil profile cache write failed",
          );
        }
      }
      return result;
    })().finally(() => {
      entry.settled = true;
    });
    const evictEntry = () => {
      if (propertyCache.get(key) === entry) propertyCache.delete(key);
    };
    entry.promise.then((result) => {
      if (!isCompletePredictionSet(result.predictions)) evictEntry();
    }, evictEntry);
    propertyCache.set(key, entry);
    if (propertyCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = propertyCache.keys().next().value;
      if (oldestKey && oldestKey !== key) propertyCache.delete(oldestKey);
    }
    return consumeEntry(entry, signal);
  };

  const getProfile = async (
    properties: readonly SoilGridsProperty[],
    longitude: number,
    latitude: number,
    signal?: AbortSignal,
  ) => {
    const results = await Promise.allSettled(
      properties.map((property) => getProperty(property, longitude, latitude, signal)),
    );

    if (signal?.aborted) throw signal.reason;
    if (results.every((result) => result.status === "rejected")) {
      const firstFailure = results[0];
      throw firstFailure?.status === "rejected"
        ? firstFailure.reason
        : new SoilProfileProviderError("REQUEST_FAILED");
    }

    const layers = SOIL_PROFILE_DEPTH_INTERVALS.map(({ topDepthCm, bottomDepthCm }) => ({
      topDepthCm,
      bottomDepthCm,
      sandPercent: emptyPrediction(),
      siltPercent: emptyPrediction(),
      clayPercent: emptyPrediction(),
      soilOrganicCarbonGramsPerKilogram: emptyPrediction(),
      ph: emptyPrediction(),
      bulkDensityKilogramsPerCubicDecimeter: emptyPrediction(),
      waterContent10KpaPercent: emptyPrediction(),
      waterContent33KpaPercent: emptyPrediction(),
      waterContent1500KpaPercent: emptyPrediction(),
    })) as SoilProfileLayers;

    results.forEach((result, propertyIndex) => {
      if (result.status !== "fulfilled") return;
      const property = properties[propertyIndex];
      if (!property) return;
      layers.forEach((layer, depthIndex) => {
        layer[property.field] = result.value.predictions[depthIndex] ?? emptyPrediction();
      });
    });

    const retrievedAt = results
      .flatMap((result) => (result.status === "fulfilled" ? [result.value.retrievedAt] : []))
      .toSorted()
      .at(-1);

    return {
      layers,
      retrievedAt: retrievedAt ?? now().toISOString(),
      sourceUrl: SOILGRIDS_WMS_URL,
    };
  };

  return {
    async getProfile(longitude, latitude, signal) {
      return getProfile(PROPERTIES, longitude, latitude, signal);
    },
    async getWaterProfile(longitude, latitude, signal) {
      return getProfile(WATER_PROPERTIES, longitude, latitude, signal);
    },
  };
}
