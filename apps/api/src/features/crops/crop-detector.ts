import type { ParcelGeometry } from "@kowr/contracts";

export type CropIntersection = {
  overlapAreaSquareMeters: number;
  sourceGroup: string;
  sourceLabel: string;
};

export type CropIntersectionResult = {
  complete: boolean;
  intersections: CropIntersection[];
  parcelAreaSquareMeters: number;
  retrievedAt: string;
};

export class CropDetectorError extends Error {
  readonly code: "INVALID_RESPONSE" | "REQUEST_FAILED" | "TIMEOUT";

  constructor(code: CropDetectorError["code"], cause?: unknown) {
    super("The crop declaration request could not be completed.", { cause });
    this.name = "CropDetectorError";
    this.code = code;
  }
}

export interface CropDetector {
  findIntersections(
    geometry: ParcelGeometry,
    signal?: AbortSignal,
  ): Promise<CropIntersectionResult>;
}
