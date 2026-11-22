import {
  CROP_CATALOG,
  type Crop,
  type CropDetectionRequest,
  type CropDetectionResponse,
} from "@kowr/contracts";
import { CropProviderUnavailableError } from "./crop-detection.errors.js";
import { type CropDetector, CropDetectorError } from "./crop-detector.js";

const DOMINANT_DECLARATION_SHARE = 0.8;
const MIN_CANDIDATE_PARCEL_SHARE = 0.01;
const CATALOG_BY_SOURCE_LABEL = new Map<string, (typeof CROP_CATALOG)[number]>(
  CROP_CATALOG.map((crop) => [crop.sourceLabel, crop]),
);

type AggregatedCandidate = {
  crop: Crop;
  label: string;
  overlapAreaSquareMeters: number;
};

export async function detectCrops(
  request: CropDetectionRequest,
  detector: CropDetector,
  signal?: AbortSignal,
): Promise<CropDetectionResponse> {
  let result: Awaited<ReturnType<CropDetector["findIntersections"]>>;

  try {
    result = await detector.findIntersections(request.geometry, signal);
  } catch (error) {
    if (error instanceof CropDetectorError) throw new CropProviderUnavailableError();
    throw error;
  }

  const candidatesByCrop = new Map<Crop, AggregatedCandidate>();

  for (const intersection of result.intersections) {
    if (
      intersection.overlapAreaSquareMeters / result.parcelAreaSquareMeters <
      MIN_CANDIDATE_PARCEL_SHARE
    ) {
      continue;
    }

    const catalogCrop = CATALOG_BY_SOURCE_LABEL.get(intersection.sourceLabel);
    if (!catalogCrop) continue;

    const current = candidatesByCrop.get(catalogCrop.id);
    candidatesByCrop.set(catalogCrop.id, {
      crop: catalogCrop.id,
      label: catalogCrop.label,
      overlapAreaSquareMeters:
        (current?.overlapAreaSquareMeters ?? 0) + intersection.overlapAreaSquareMeters,
    });
  }

  const candidates = [...candidatesByCrop.values()]
    .toSorted((left, right) => right.overlapAreaSquareMeters - left.overlapAreaSquareMeters)
    .map((candidate) => ({
      ...candidate,
      overlapPercent: Math.min(
        100,
        (candidate.overlapAreaSquareMeters / result.parcelAreaSquareMeters) * 100,
      ),
    }));
  const totalOverlapArea = candidates.reduce(
    (total, candidate) => total + candidate.overlapAreaSquareMeters,
    0,
  );
  const dominantShare = candidates[0]
    ? candidates[0].overlapAreaSquareMeters / totalOverlapArea
    : 0;
  const status =
    candidates.length === 0
      ? "not_found"
      : result.complete && (candidates.length === 1 || dominantShare >= DOMINANT_DECLARATION_SHARE)
        ? "suggested"
        : "multiple";

  return {
    status,
    candidates,
    complete: result.complete,
    provenance: {
      provider: "ARiMR GSA",
      dataset: "Deklaracje rolne 2025 - uprawy (GSA)",
      campaign: 2025,
      retrievedAt: result.retrievedAt,
    },
  };
}
