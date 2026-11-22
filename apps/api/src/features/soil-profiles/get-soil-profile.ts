import {
  calculateAvailableWaterCapacityRange,
  findRepresentativeInteriorPoint,
} from "@kowr/analysis";
import type { ParcelResponse, SoilProfileResponse, SoilProfileStatus } from "@kowr/contracts";
import { findParcel } from "../parcels/find-parcel.js";
import type { ParcelLocator } from "../parcels/parcel-locator.js";
import {
  SoilProfileLocationUnavailableError,
  SoilProfileProviderUnavailableError,
} from "./soil-profile.errors.js";
import { type SoilProfileProvider, SoilProfileProviderError } from "./soil-profile-provider.js";

function getStatus(layers: SoilProfileResponse["layers"]): SoilProfileStatus {
  const values = layers.flatMap((layer) =>
    [
      layer.sandPercent,
      layer.siltPercent,
      layer.clayPercent,
      layer.soilOrganicCarbonGramsPerKilogram,
      layer.ph,
      layer.bulkDensityKilogramsPerCubicDecimeter,
      layer.waterContent10KpaPercent,
      layer.waterContent33KpaPercent,
      layer.waterContent1500KpaPercent,
    ].flatMap((prediction) => [prediction.q05, prediction.q50, prediction.q95]),
  );

  values.push(
    ...layers.flatMap((layer) => [
      layer.availableWaterCapacity.using33Kpa?.volumetricPercent ?? null,
      layer.availableWaterCapacity.using33Kpa?.millimeters ?? null,
      layer.availableWaterCapacity.using10Kpa?.volumetricPercent ?? null,
      layer.availableWaterCapacity.using10Kpa?.millimeters ?? null,
    ]),
  );

  if (values.every((value) => value === null)) return "no-data";
  if (values.every((value) => value !== null)) return "complete";
  return "partial";
}

export async function getSoilProfile(
  parcelIdentifier: string,
  parcelLocator: ParcelLocator,
  provider: SoilProfileProvider,
  signal?: AbortSignal,
): Promise<SoilProfileResponse> {
  const parcel = await findParcel({ identifier: parcelIdentifier }, parcelLocator, signal);
  return getSoilProfileForParcel(parcel, provider, signal);
}

export async function getSoilProfileForParcel(
  parcel: Pick<ParcelResponse, "geometry">,
  provider: SoilProfileProvider,
  signal?: AbortSignal,
): Promise<SoilProfileResponse> {
  return getSoilProfileForParcelWithMethod(parcel, provider, "full", signal);
}

export async function getSoilWaterProfileForParcel(
  parcel: Pick<ParcelResponse, "geometry">,
  provider: SoilProfileProvider,
  signal?: AbortSignal,
): Promise<SoilProfileResponse> {
  return getSoilProfileForParcelWithMethod(parcel, provider, "water-balance", signal);
}

async function getSoilProfileForParcelWithMethod(
  parcel: Pick<ParcelResponse, "geometry">,
  provider: SoilProfileProvider,
  method: "full" | "water-balance",
  signal?: AbortSignal,
): Promise<SoilProfileResponse> {
  const location = findRepresentativeInteriorPoint(parcel.geometry);
  if (!location) throw new SoilProfileLocationUnavailableError();

  let providedProfile: Awaited<ReturnType<SoilProfileProvider["getProfile"]>>;
  try {
    const getProfile =
      method === "water-balance" && provider.getWaterProfile
        ? provider.getWaterProfile.bind(provider)
        : provider.getProfile.bind(provider);
    providedProfile = await getProfile(location[0], location[1], signal);
  } catch (error) {
    if (error instanceof SoilProfileProviderError) {
      throw new SoilProfileProviderUnavailableError();
    }

    throw error;
  }

  const layers = providedProfile.layers.map((layer) => ({
    ...layer,
    availableWaterCapacity: calculateAvailableWaterCapacityRange({
      waterContent10KpaPercent: layer.waterContent10KpaPercent.q50,
      waterContent33KpaPercent: layer.waterContent33KpaPercent.q50,
      waterContent1500KpaPercent: layer.waterContent1500KpaPercent.q50,
      topDepthCm: layer.topDepthCm,
      bottomDepthCm: layer.bottomDepthCm,
    }),
  })) as SoilProfileResponse["layers"];

  const response: SoilProfileResponse = {
    status: getStatus(layers),
    sample: {
      location: { type: "Point", coordinates: [location[0], location[1]] },
      method: "representative-interior-point",
      spatialSupport: "single-soilgrids-cell",
    },
    layers,
    provenance: {
      provider: "ISRIC",
      dataset: "SoilGrids250m 2.0",
      resolutionMeters: 250,
      predictionStatistic: "Q0.50",
      uncertaintyInterval: "Q0.05-Q0.95",
      license: "CC BY 4.0",
      sourceUrl: providedProfile.sourceUrl,
      retrievedAt: providedProfile.retrievedAt,
    },
    limitations: [
      "single-representative-location",
      "modelled-not-field-measured",
      "nominal-250m-resolution",
      "not-current-soil-moisture",
      "not-date-specific",
      "field-capacity-method-range",
    ],
  };

  return response;
}
