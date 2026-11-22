import { getCropModelCapability } from "@kowr/analysis";
import { CROP_CATALOG, type CropModelCapabilitiesResponse } from "@kowr/contracts";

export function listCropModelCapabilities(): CropModelCapabilitiesResponse {
  return CROP_CATALOG.map(({ id }) => {
    const capability = getCropModelCapability(id);
    return capability.kind === "environment-only"
      ? { crop: id, kind: capability.kind, profileId: null }
      : capability.kind === "approximate"
        ? { crop: id, kind: "approximate", profileId: capability.profileId }
        : { crop: id, kind: "species-reference", profileId: capability.profileId };
  });
}
