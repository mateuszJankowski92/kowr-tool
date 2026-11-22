import { generateParcelRecommendations } from "@kowr/analysis";
import type { RecommendationContextRequest, RecommendationResponse } from "@kowr/contracts";

export function createRecommendations(
  request: RecommendationContextRequest,
): RecommendationResponse {
  return generateParcelRecommendations({
    crop: { id: request.crop, period: request.cropPeriod },
    water: { ...request.water },
    soil: { ...request.soil },
    terrain: { ...request.terrain },
    hydrology: { ...request.hydrology },
    landUse: { ...request.landUse },
    satellite: { ...request.satellite },
  });
}
