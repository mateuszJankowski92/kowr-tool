import type {
  ParcelGeometry,
  SatelliteCombinedObservation,
  SatelliteFrameResponse,
  SatelliteHistoryResponse,
  SatelliteIndicator,
  SatelliteLayer,
  SatelliteObservation,
  SatelliteProvenance,
} from "@kowr/contracts";
import type { FastifyBaseLogger } from "fastify";
import proj4 from "proj4";
import { z } from "zod";
import {
  type SatelliteHistoryProvider,
  SatelliteHistoryProviderError,
} from "../../features/satellite-history/satellite-history-provider.js";

const CDSE_STAC_SEARCH_URL = "https://stac.dataspace.copernicus.eu/v1/search";
const CDSE_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const CDSE_PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const CDSE_STATISTICS_URL = "https://sh.dataspace.copernicus.eu/statistics/v1";
const COLLECTION = "sentinel-2-l2a";
const LICENSE = "Contains modified Copernicus Sentinel data";
const WGS84_URI = "http://www.opengis.net/def/crs/EPSG/0/4326";
const MIN_USEFUL_PIXEL_PERCENT = 70;
const MIN_LIMITED_PIXEL_PERCENT = 30;

const StacItemSchema = z
  .object({
    id: z.string().min(1),
    properties: z
      .object({
        datetime: z.iso.datetime({ offset: true }),
        "eo:cloud_cover": z.number().min(0).max(100).nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const StacResponseSchema = z
  .object({
    features: z.array(StacItemSchema),
  })
  .passthrough();

const TokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
  })
  .passthrough();

const StatisticValueSchema = z.union([z.number(), z.literal("NaN")]);

const StatisticsSchema = z
  .object({
    min: StatisticValueSchema.optional(),
    max: StatisticValueSchema.optional(),
    mean: StatisticValueSchema.optional(),
    stDev: StatisticValueSchema.optional(),
    sampleCount: z.number().int().nonnegative(),
    noDataCount: z.number().int().nonnegative(),
    percentiles: z.record(z.string(), StatisticValueSchema).optional(),
  })
  .passthrough();

const HistogramSchema = z
  .object({
    bins: z.array(
      z
        .object({
          count: z.number().int().nonnegative(),
          highEdge: z.number(),
          lowEdge: z.number(),
        })
        .passthrough(),
    ),
    overflowCount: z.number().int().nonnegative().optional(),
    underflowCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const StatisticsResponseSchema = z
  .object({
    geometryPixelCount: z.number().int().positive(),
    data: z.array(
      z
        .object({
          interval: z
            .object({
              from: z.iso.datetime({ offset: true }),
              to: z.iso.datetime({ offset: true }),
            })
            .passthrough(),
          outputs: z.record(
            z.string(),
            z
              .object({
                bands: z.record(
                  z.string(),
                  z
                    .object({
                      histogram: HistogramSchema.optional(),
                      stats: StatisticsSchema,
                    })
                    .passthrough(),
                ),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type CdseSatelliteProviderOptions = {
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof globalThis.fetch;
  logger: Pick<FastifyBaseLogger, "warn">;
  now?: () => Date;
  timeoutMs?: number;
};

type Bounds = [number, number, number, number];
type ProviderGeometry =
  | {
      type: "Polygon";
      coordinates: [number, number][][];
    }
  | {
      type: "MultiPolygon";
      coordinates: [number, number][][][];
    };

function flattenPositions(geometry: ParcelGeometry): [number, number][] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function getBounds(geometry: ParcelGeometry): Bounds {
  const positions = flattenPositions(geometry);
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

function projectForStatistics(geometry: ParcelGeometry): {
  crs: string;
  geometry: ProviderGeometry;
} {
  const [west, , east] = getBounds(geometry);
  const centralLongitude = (west + east) / 2;
  const zone = Math.min(60, Math.max(1, Math.floor((centralLongitude + 180) / 6) + 1));
  const epsgCode = 32600 + zone;
  const projectionCode = `EPSG:${epsgCode}`;

  if (!proj4.defs(projectionCode)) {
    proj4.defs(projectionCode, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs +type=crs`);
  }

  const projectPosition = (position: [number, number]): [number, number] => {
    const [x, y] = proj4("EPSG:4326", projectionCode, position);
    return [x, y];
  };

  return {
    crs: `http://www.opengis.net/def/crs/EPSG/0/${epsgCode}`,
    geometry:
      geometry.type === "Polygon"
        ? {
            type: "Polygon",
            coordinates: geometry.coordinates.map((ring) => ring.map(projectPosition)),
          }
        : {
            type: "MultiPolygon",
            coordinates: geometry.coordinates.map((polygon) =>
              polygon.map((ring) => ring.map(projectPosition)),
            ),
          },
  };
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function getRequestedPeriod(
  year: number,
  throughDate: string,
): { from: string; to: string } | null {
  const throughYear = Number(throughDate.slice(0, 4));
  if (year > throughYear) return null;

  const endDate = year === throughYear ? throughDate : `${year}-12-31`;
  return {
    from: `${year}-01-01T00:00:00Z`,
    to: `${nextDate(endDate)}T00:00:00Z`,
  };
}

function getDatePeriod(fromDate: string, throughDate: string): { from: string; to: string } {
  return {
    from: `${fromDate}T00:00:00Z`,
    to: `${nextDate(throughDate)}T00:00:00Z`,
  };
}

function createProvenance(retrievedAt: string): SatelliteProvenance {
  return {
    collection: COLLECTION,
    license: LICENSE,
    provider: "Copernicus Data Space Ecosystem",
    retrievedAt,
    sourceUrl: CDSE_STAC_SEARCH_URL,
  };
}

function createIndexExpression(indicator: SatelliteIndicator): string {
  return indicator === "ndmi"
    ? "index(samples.B8A, samples.B11)"
    : "index(samples.B08, samples.B04)";
}

function createInputBands(indicator: SatelliteIndicator): string {
  return indicator === "ndmi"
    ? '"B8A", "B11", "SCL", "dataMask"'
    : '"B08", "B04", "SCL", "dataMask"';
}

function createValidityExpression(): string {
  return "samples.dataMask === 1 && [4, 5].includes(samples.SCL)";
}

function createStatisticsEvalscript(indicator: SatelliteIndicator): string {
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: [${createInputBands(indicator)}] }],
    output: [
      { id: "index", bands: 1, sampleType: "FLOAT32" },
      { id: "scl", bands: 1, sampleType: "UINT8" },
      { id: "dataMask", bands: ["index", "scl"] }
    ]
  };
}
function evaluatePixel(samples) {
  const valid = ${createValidityExpression()};
  return {
    index: [valid ? ${createIndexExpression(indicator)} : NaN],
    scl: [samples.SCL],
    dataMask: [valid ? 1 : 0, samples.dataMask]
  };
}`;
}

function createRenderEvalscript(layer: SatelliteLayer): string {
  if (layer === "true-color") {
    return `//VERSION=3
function setup() {
  return { input: [{ bands: ["B02", "B03", "B04", "SCL", "dataMask"] }], output: { bands: 4 } };
}
function evaluatePixel(samples) {
  const valid = ${createValidityExpression()};
  return [3.5 * samples.B04, 3.5 * samples.B03, 3.5 * samples.B02, valid ? 1 : 0];
}`;
  }

  const ramp =
    layer === "ndmi"
      ? "[[-1, 0x8c510a], [-0.3, 0xd8b365], [0, 0xf6e8c3], [0.25, 0x5ab4ac], [0.6, 0x01665e], [1, 0x003c30]]"
      : "[[-1, 0x6e3b87], [0, 0xc9a66b], [0.2, 0xf0e6a6], [0.5, 0x7fbc41], [0.8, 0x238443], [1, 0x005a32]]";
  const indicator = layer === "ndmi" ? "ndmi" : "ndvi";

  return `//VERSION=3
function setup() {
  return { input: [{ bands: [${createInputBands(indicator)}] }], output: { bands: 4 } };
}
const visualizer = new ColorRampVisualizer(${ramp});
function evaluatePixel(samples) {
  const valid = ${createValidityExpression()};
  const value = ${createIndexExpression(indicator)};
  return visualizer.process(value).concat(valid ? 1 : 0);
}`;
}

function getOutputSize(bounds: Bounds, layer: SatelliteLayer): { width: number; height: number } {
  const [west, south, east, north] = bounds;
  const latitude = (south + north) / 2;
  const widthMeters = Math.max(1, (east - west) * 111_320 * Math.cos((latitude * Math.PI) / 180));
  const heightMeters = Math.max(1, (north - south) * 111_320);
  const resolution = layer === "ndmi" ? 20 : 10;
  const scale = Math.min(1, 768 / Math.max(widthMeters / resolution, heightMeters / resolution));

  return {
    width: Math.max(64, Math.ceil((widthMeters / resolution) * scale)),
    height: Math.max(64, Math.ceil((heightMeters / resolution) * scale)),
  };
}

type ParsedStatistics = {
  median: number | null;
  quality: NonNullable<SatelliteObservation["quality"]>;
  validPixelPercent: number;
};

function getHistogramCount(
  histogram: z.infer<typeof HistogramSchema> | undefined,
  classification: number,
): number | null {
  const bin = histogram?.bins.find(
    ({ highEdge, lowEdge }) => lowEdge <= classification && highEdge > classification,
  );
  return bin?.count ?? null;
}

function getQualityAssessment(
  validPixelPercent: number,
): ParsedStatistics["quality"]["assessment"] {
  if (validPixelPercent >= MIN_USEFUL_PIXEL_PERCENT) return "sufficient";
  if (validPixelPercent >= MIN_LIMITED_PIXEL_PERCENT) return "limited";
  return "insufficient";
}

function parseStatistics(payload: unknown): Map<string, ParsedStatistics> {
  const parsed = StatisticsResponseSchema.safeParse(payload);
  if (!parsed.success) throw new SatelliteHistoryProviderError("INVALID_RESPONSE", parsed.error);

  const result = new Map<string, ParsedStatistics>();
  const geometryPixelCount = parsed.data.geometryPixelCount;
  for (const interval of parsed.data.data) {
    const stats = interval.outputs.index?.bands.B0?.stats;
    const median = stats?.percentiles?.["50.0"];
    if (!stats || stats.sampleCount === 0) continue;

    const validCount = Math.max(0, stats.sampleCount - stats.noDataCount);
    const validPixelPercent =
      Math.round((Math.min(validCount, geometryPixelCount) / geometryPixelCount) * 1_000) / 10;
    const sclBand = interval.outputs.scl?.bands.B0;
    const sclCounts = Array.from({ length: 12 }, (_, classification) =>
      getHistogramCount(sclBand?.histogram, classification),
    );
    const hasSclBreakdown = sclCounts.every((count) => count !== null);
    const availablePixelCount = sclBand
      ? Math.max(0, sclBand.stats.sampleCount - sclBand.stats.noDataCount)
      : 0;
    const outsideOrMissingCount = Math.max(0, geometryPixelCount - availablePixelCount);
    const count = (classification: number) => sclCounts[classification] ?? 0;
    const noDataCount = outsideOrMissingCount + count(0);
    const cloudCount = count(8) + count(9) + count(10);
    const cloudShadowCount = count(3);
    const snowCount = count(11);
    const otherCount = Math.max(
      0,
      geometryPixelCount - validCount - noDataCount - cloudCount - cloudShadowCount - snowCount,
    );

    result.set(interval.interval.from.slice(0, 10), {
      median: typeof median === "number" ? median : null,
      validPixelPercent,
      quality: {
        assessment: getQualityAssessment(validPixelPercent),
        geometryPixelCount,
        thresholdPercent: MIN_USEFUL_PIXEL_PERCENT,
        validPixelCount: validCount,
        rejectedPixelCounts: hasSclBreakdown
          ? {
              cloud: cloudCount,
              cloudShadow: cloudShadowCount,
              noData: noDataCount,
              other: otherCount,
              snow: snowCount,
            }
          : null,
      },
    });
  }
  return result;
}

export function createCdseSatelliteProvider(
  options: CdseSatelliteProviderOptions,
): SatelliteHistoryProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 25_000;
  let cachedToken: { value: string; expiresAtMs: number } | null = null;

  const requestSignal = (signal?: AbortSignal) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return {
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      timeoutSignal,
    };
  };

  const getToken = async (signal?: AbortSignal): Promise<string> => {
    if (!options.clientId || !options.clientSecret) {
      throw new SatelliteHistoryProviderError("NOT_CONFIGURED");
    }
    if (cachedToken && cachedToken.expiresAtMs > now().getTime() + 60_000) return cachedToken.value;

    const request = requestSignal(signal);
    const body = new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      grant_type: "client_credentials",
    });

    let response: Response;
    try {
      response = await fetchImplementation(CDSE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: request.signal,
      });
    } catch (error) {
      throw new SatelliteHistoryProviderError(
        request.timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
        error,
      );
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new SatelliteHistoryProviderError("AUTHENTICATION_FAILED");
    }
    if (!response.ok) throw new SatelliteHistoryProviderError("REQUEST_FAILED");

    const parsed = TokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SatelliteHistoryProviderError("INVALID_RESPONSE", parsed.error);
    cachedToken = {
      value: parsed.data.access_token,
      expiresAtMs: now().getTime() + parsed.data.expires_in * 1_000,
    };
    return cachedToken.value;
  };

  const postJson = async (
    url: string,
    payload: unknown,
    token: string,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const request = requestSignal(signal);
    try {
      const response = await fetchImplementation(url, {
        method: "POST",
        headers: {
          Accept: url === CDSE_PROCESS_URL ? "image/png" : "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
      if (response.status === 401 || response.status === 403) {
        cachedToken = null;
        throw new SatelliteHistoryProviderError("AUTHENTICATION_FAILED");
      }
      if (!response.ok) throw new SatelliteHistoryProviderError("REQUEST_FAILED");
      return response;
    } catch (error) {
      if (error instanceof SatelliteHistoryProviderError) throw error;
      throw new SatelliteHistoryProviderError(
        request.timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
        error,
      );
    }
  };

  const listObservations = async (
    geometry: ParcelGeometry,
    period: { from: string; to: string },
    signal?: AbortSignal,
  ): Promise<SatelliteObservation[]> => {
    const request = requestSignal(signal);
    let response: Response;
    try {
      response = await fetchImplementation(CDSE_STAC_SEARCH_URL, {
        method: "POST",
        headers: { Accept: "application/geo+json", "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: [COLLECTION],
          intersects: geometry,
          datetime: `${period.from}/${period.to}`,
          limit: 500,
          sortby: [{ field: "datetime", direction: "asc" }],
          fields: {
            include: ["id", "properties.datetime", "properties.eo:cloud_cover"],
            exclude: ["assets", "bbox", "geometry", "links"],
          },
        }),
        signal: request.signal,
      });
    } catch (error) {
      throw new SatelliteHistoryProviderError(
        request.timeoutSignal.aborted ? "TIMEOUT" : "REQUEST_FAILED",
        error,
      );
    }
    if (!response.ok) throw new SatelliteHistoryProviderError("REQUEST_FAILED");

    const parsed = StacResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SatelliteHistoryProviderError("INVALID_RESPONSE", parsed.error);

    const byDate = new Map<string, z.infer<typeof StacItemSchema>>();
    for (const item of parsed.data.features) {
      const date = item.properties.datetime.slice(0, 10);
      const existing = byDate.get(date);
      const cloud = item.properties["eo:cloud_cover"] ?? Number.POSITIVE_INFINITY;
      const existingCloud = existing?.properties["eo:cloud_cover"] ?? Number.POSITIVE_INFINITY;
      if (!existing || cloud < existingCloud) byDate.set(date, item);
    }

    return [...byDate.entries()].map(([date, item]) => ({
      acquiredAt: item.properties.datetime,
      date,
      id: item.id,
      median: null,
      quality: null,
      sceneCloudPercent: item.properties["eo:cloud_cover"] ?? null,
      validPixelPercent: null,
    }));
  };

  const getStatistics = async (
    geometry: ParcelGeometry,
    period: { from: string; to: string },
    indicator: SatelliteIndicator,
    signal?: AbortSignal,
    existingToken?: string,
  ) => {
    const token = existingToken ?? (await getToken(signal));
    const projected = projectForStatistics(geometry);
    const response = await postJson(
      CDSE_STATISTICS_URL,
      {
        input: {
          bounds: { geometry: projected.geometry, properties: { crs: projected.crs } },
          data: [{ type: COLLECTION, dataFilter: { mosaickingOrder: "leastCC" } }],
        },
        aggregation: {
          timeRange: period,
          aggregationInterval: { of: "P1D" },
          evalscript: createStatisticsEvalscript(indicator),
          resx: indicator === "ndmi" ? 20 : 10,
          resy: indicator === "ndmi" ? 20 : 10,
        },
        calculations: {
          index: { statistics: { default: { percentiles: { k: [50] } } } },
          scl: { histograms: { default: { nBins: 12, lowEdge: 0, highEdge: 12 } } },
        },
      },
      token,
      signal,
    );
    return parseStatistics(await response.json());
  };

  return {
    async getHistory(geometry, year, throughDate, indicator, signal) {
      const startedAt = performance.now();
      const retrievedAt = now().toISOString();
      const period = getRequestedPeriod(year, throughDate);
      if (!period) {
        return {
          year,
          indicator,
          status: "complete",
          observations: [],
          limitations: ["The selected year is later than the analysis date."],
          provenance: createProvenance(retrievedAt),
        };
      }

      try {
        const observations = await listObservations(geometry, period, signal);
        const limitations: string[] = [];
        let status: SatelliteHistoryResponse["status"] = "complete";

        try {
          const statistics = await getStatistics(geometry, period, indicator, signal);
          for (const observation of observations) {
            const stats = statistics.get(observation.date);
            if (!stats) continue;
            observation.median = stats.median;
            observation.quality = stats.quality;
            observation.validPixelPercent = stats.validPixelPercent;
          }
        } catch (error) {
          status = "partial";
          limitations.push(
            error instanceof SatelliteHistoryProviderError && error.code === "NOT_CONFIGURED"
              ? "CDSE credentials are not configured; dates are available but parcel statistics and imagery are disabled."
              : "Parcel statistics are temporarily unavailable; observation dates come from the public CDSE catalogue.",
          );
          options.logger.warn(
            {
              provider: "Copernicus Data Space Ecosystem",
              durationMs: Math.round(performance.now() - startedAt),
              errorCode:
                error instanceof SatelliteHistoryProviderError
                  ? `CDSE_STATISTICS_${error.code}`
                  : "CDSE_STATISTICS_REQUEST_FAILED",
            },
            "Satellite parcel statistics request failed",
          );
        }

        return {
          year,
          indicator,
          status,
          observations,
          limitations,
          provenance: createProvenance(retrievedAt),
        };
      } catch (error) {
        const providerError =
          error instanceof SatelliteHistoryProviderError
            ? error
            : new SatelliteHistoryProviderError("REQUEST_FAILED", error);
        options.logger.warn(
          {
            provider: "Copernicus Data Space Ecosystem",
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: `CDSE_CATALOG_${providerError.code}`,
          },
          "Satellite observation catalogue request failed",
        );
        throw providerError;
      }
    },

    async getObservationSeries(geometry, fromDate, throughDate, signal) {
      const startedAt = performance.now();
      const retrievedAt = now().toISOString();
      const period = getDatePeriod(fromDate, throughDate);

      try {
        const catalogueObservations = await listObservations(geometry, period, signal);
        const observations: SatelliteCombinedObservation[] = catalogueObservations.map(
          (observation) => ({
            acquiredAt: observation.acquiredAt,
            date: observation.date,
            id: observation.id,
            indicators: {
              ndmi: { median: null, quality: null, validPixelPercent: null },
              ndvi: { median: null, quality: null, validPixelPercent: null },
            },
            sceneCloudPercent: observation.sceneCloudPercent,
          }),
        );
        const limitations: string[] = [];
        let status: "complete" | "partial" = "complete";

        try {
          const token = await getToken(signal);
          const [ndmiResult, ndviResult] = await Promise.allSettled([
            getStatistics(geometry, period, "ndmi", signal, token),
            getStatistics(geometry, period, "ndvi", signal, token),
          ]);

          for (const [indicator, result] of [
            ["ndmi", ndmiResult],
            ["ndvi", ndviResult],
          ] as const) {
            if (result.status === "rejected") {
              status = "partial";
              limitations.push(`${indicator.toUpperCase()} parcel statistics are unavailable.`);
              options.logger.warn(
                {
                  provider: "Copernicus Data Space Ecosystem",
                  indicator,
                  durationMs: Math.round(performance.now() - startedAt),
                  errorCode:
                    result.reason instanceof SatelliteHistoryProviderError
                      ? `CDSE_STATISTICS_${result.reason.code}`
                      : "CDSE_STATISTICS_REQUEST_FAILED",
                },
                "Satellite indicator statistics request failed",
              );
              continue;
            }
            for (const observation of observations) {
              const statistics = result.value.get(observation.date);
              if (statistics) observation.indicators[indicator] = statistics;
            }
          }
        } catch (error) {
          status = "partial";
          limitations.push(
            error instanceof SatelliteHistoryProviderError && error.code === "NOT_CONFIGURED"
              ? "CDSE credentials are not configured; observation dates are available, but parcel statistics are disabled."
              : "Parcel statistics are temporarily unavailable; observation dates come from the public CDSE catalogue.",
          );
          options.logger.warn(
            {
              provider: "Copernicus Data Space Ecosystem",
              durationMs: Math.round(performance.now() - startedAt),
              errorCode:
                error instanceof SatelliteHistoryProviderError
                  ? `CDSE_STATISTICS_${error.code}`
                  : "CDSE_STATISTICS_REQUEST_FAILED",
            },
            "Satellite parcel statistics request failed",
          );
        }

        return {
          limitations,
          observations,
          provenance: createProvenance(retrievedAt),
          status,
        };
      } catch (error) {
        const providerError =
          error instanceof SatelliteHistoryProviderError
            ? error
            : new SatelliteHistoryProviderError("REQUEST_FAILED", error);
        options.logger.warn(
          {
            provider: "Copernicus Data Space Ecosystem",
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: `CDSE_CATALOG_${providerError.code}`,
          },
          "Satellite observation catalogue request failed",
        );
        throw providerError;
      }
    },

    async getFrame(geometry, date, layer, signal): Promise<SatelliteFrameResponse> {
      const startedAt = performance.now();
      try {
        const token = await getToken(signal);
        const bounds = getBounds(geometry);
        const size = getOutputSize(bounds, layer);
        const response = await postJson(
          CDSE_PROCESS_URL,
          {
            input: {
              bounds: { geometry, properties: { crs: WGS84_URI } },
              data: [
                {
                  type: COLLECTION,
                  dataFilter: {
                    timeRange: {
                      from: `${date}T00:00:00Z`,
                      to: `${nextDate(date)}T00:00:00Z`,
                    },
                    mosaickingOrder: "leastCC",
                  },
                },
              ],
            },
            output: {
              ...size,
              responses: [{ identifier: "default", format: { type: "image/png" } }],
            },
            evalscript: createRenderEvalscript(layer),
          },
          token,
          signal,
        );
        const image = Buffer.from(await response.arrayBuffer());
        if (image.length === 0) throw new SatelliteHistoryProviderError("INVALID_RESPONSE");

        return {
          bounds,
          imageBase64: image.toString("base64"),
          layer,
          mediaType: "image/png",
          observationDate: date,
          provenance: createProvenance(now().toISOString()),
        };
      } catch (error) {
        const providerError =
          error instanceof SatelliteHistoryProviderError
            ? error
            : new SatelliteHistoryProviderError("REQUEST_FAILED", error);
        options.logger.warn(
          {
            provider: "Copernicus Data Space Ecosystem",
            durationMs: Math.round(performance.now() - startedAt),
            errorCode: `CDSE_PROCESS_${providerError.code}`,
          },
          "Satellite image processing request failed",
        );
        throw providerError;
      }
    },
  };
}
