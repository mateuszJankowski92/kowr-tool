import {
  analyzeParcelSurroundings,
  calculateTerrainMetrics,
  findTerrainInspectionCells,
} from "@kowr/analysis";
import type { TerrainContextResponse } from "@kowr/contracts";
import { ParcelNotFoundError, ParcelProviderUnavailableError } from "../parcels/parcel.errors.js";
import type { LocatedParcel, ParcelLocator } from "../parcels/parcel-locator.js";
import { ParcelLocatorError } from "../parcels/parcel-locator.js";
import type { SurroundingsProvider } from "./surroundings-provider.js";
import {
  createTerrainRequest,
  projectParcelGeometry,
  unprojectTerrainPosition,
} from "./terrain-geometry.js";
import { type TerrainProvider, TerrainProviderError } from "./terrain-provider.js";

const SURROUNDINGS_SOURCE = {
  provider: "OpenStreetMap contributors",
  dataset: "OpenStreetMap via Overpass API",
  horizontalCrs: "EPSG:4326 projected to EPSG:2180",
  usageTerms: "Open Database License 1.0 (ODbL)",
} as const;

function unavailableTerrain(reason: "provider-error" | "no-data") {
  return {
    status: "unavailable" as const,
    reason,
    message:
      reason === "no-data"
        ? "The GUGiK terrain model contains no usable cells for this parcel."
        : "The GUGiK terrain model is temporarily unavailable.",
  };
}

export async function getTerrainContext(
  parcelIdentifier: string,
  parcelLocator: ParcelLocator,
  terrainProvider: TerrainProvider,
  surroundingsProvider: SurroundingsProvider,
  signal?: AbortSignal,
): Promise<TerrainContextResponse> {
  let parcel: LocatedParcel | null;
  try {
    parcel = await parcelLocator.findByIdentifier(parcelIdentifier, signal);
  } catch (error) {
    if (error instanceof ParcelLocatorError) throw new ParcelProviderUnavailableError();
    throw error;
  }
  if (!parcel) throw new ParcelNotFoundError();

  const parcelGeometry = projectParcelGeometry(parcel.geometry);
  const request = createTerrainRequest(parcelGeometry);

  const [terrainResult, surroundingsResult] = await Promise.allSettled([
    terrainProvider.getGrid(request.bounds, request.columns, request.rows, signal),
    surroundingsProvider.getFeatures(parcel.geometry, signal),
  ]);

  let terrain: TerrainContextResponse["terrain"];
  if (terrainResult.status === "fulfilled") {
    const metrics = calculateTerrainMetrics({ ...terrainResult.value, parcelGeometry });
    terrain = metrics
      ? {
          status: "available",
          metrics,
          grid: {
            columns: terrainResult.value.columns,
            rows: terrainResult.value.rows,
            bounds: terrainResult.value.bounds,
            cellSizeMeters: terrainResult.value.cellSizeMeters,
            heightsMeters: terrainResult.value.heightsMeters,
          },
          parcelGeometry,
          verticalScale: 1,
          inspectionPoints: findTerrainInspectionCells({
            ...terrainResult.value,
            parcelGeometry,
          }).map((cell) => ({
            id: cell.id,
            kind: cell.kind,
            coordinates: unprojectTerrainPosition(cell.position),
            elevationMeters: cell.elevationMeters,
            cellSizeMeters: cell.cellSizeMeters,
          })),
          source: {
            provider: "GUGiK",
            dataset: "Numeryczny Model Terenu",
            horizontalCrs: "EPSG:2180",
            verticalReference: "PL-EVRF2007-NH",
            sourceDataDate: null,
            retrievedAt: terrainResult.value.retrievedAt,
            usageTerms: "Free use under the Polish Geodetic and Cartographic Law",
          },
          limitations: [
            "The grid is resampled to a bounded resolution for interactive analysis and rendering.",
            "The source acquisition date is not exposed by the coverage response.",
            "Slope describes local terrain form and is not a confirmed surface-water flow route.",
          ],
        }
      : unavailableTerrain("no-data");
  } else {
    terrain = unavailableTerrain(
      terrainResult.reason instanceof TerrainProviderError &&
        terrainResult.reason.code === "NO_DATA"
        ? "no-data"
        : "provider-error",
    );
  }

  let surroundings: TerrainContextResponse["surroundings"];
  if (surroundingsResult.status === "fulfilled") {
    const provided = surroundingsResult.value;
    const analysis = analyzeParcelSurroundings({
      parcelGeometry,
      hydrologyFeatures: provided.hydrologyFeatures,
      landUseFeatures: provided.landUseFeatures,
      searchRadiusMeters: provided.searchRadiusMeters,
    });
    const source = {
      ...SURROUNDINGS_SOURCE,
      snapshotAt: provided.source.snapshotAt,
      retrievedAt: provided.source.retrievedAt,
      sourceUrl: provided.source.sourceUrl,
    };
    const hydrologyFeaturesById = new Map(
      provided.hydrologyFeatures.map((feature) => [feature.id, feature]),
    );
    surroundings = {
      hydrology: {
        status: "available",
        ...analysis.hydrology,
        objects: analysis.hydrology.objects.map((object) => {
          const feature = hydrologyFeaturesById.get(object.id);
          if (!feature) throw new Error("Analysed hydrology geometry is missing.");
          const geometry =
            feature.geometry.type === "LineString"
              ? {
                  type: "LineString" as const,
                  coordinates: feature.geometry.coordinates.map(unprojectTerrainPosition),
                }
              : {
                  type: "Polygon" as const,
                  coordinates: feature.geometry.coordinates.map((ring) =>
                    ring.map(unprojectTerrainPosition),
                  ),
                };
          return { ...object, geometry };
        }),
        source,
        limitations: [
          "OpenStreetMap is community-maintained and may omit existing water objects.",
          "Distances are straight-line distances from the current parcel boundary, not confirmed water-flow connections.",
          "The current map snapshot is used for historical analysis dates because versioned local context is not retrieved.",
        ],
      },
      landUse: {
        status: "available",
        ...analysis.landUse,
        source,
        limitations: [
          "Shares are estimated from a bounded sampling grid and describe only mapped OpenStreetMap polygons.",
          "Unclassified coverage remains unknown and is not assigned to agriculture or another class.",
          "The classes are contextual map categories, not cadastral, legal, or ARiMR declarations.",
          "The current map snapshot is used for historical analysis dates because versioned local context is not retrieved.",
        ],
      },
    };
  } else {
    const unavailable = {
      status: "unavailable" as const,
      reason: "provider-error" as const,
      message:
        "OpenStreetMap surroundings are temporarily unavailable; absence of water or land-use features is not inferred.",
    };
    surroundings = {
      hydrology: {
        ...unavailable,
      },
      landUse: {
        ...unavailable,
      },
    };
  }

  const availableSourceCount = [
    terrain.status === "available",
    surroundings.hydrology.status === "available",
    surroundings.landUse.status === "available",
  ].filter(Boolean).length;

  return {
    status:
      availableSourceCount === 3
        ? "complete"
        : availableSourceCount === 0
          ? "unavailable"
          : "partial",
    parcelIdentifier: parcel.identifier,
    terrain,
    surroundings,
  };
}
