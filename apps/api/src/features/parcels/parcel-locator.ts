export type ParcelPosition = [longitude: number, latitude: number];

export type ParcelGeometry =
  | {
      type: "Polygon";
      coordinates: ParcelPosition[][];
    }
  | {
      type: "MultiPolygon";
      coordinates: ParcelPosition[][][];
    };

export type LocatedParcel = {
  identifier: string;
  parcelNumber: string;
  geometry: ParcelGeometry;
  administrativeArea: {
    voivodeship: string | null;
    county: string | null;
    commune: string | null;
    cadastralDistrict: string | null;
  };
  provenance: {
    provider: "GUGiK ULDK" | "GUGiK EGiB WFS";
    datasource: string | null;
    retrievedAt: string;
  };
};

export class ParcelLocatorError extends Error {
  readonly code: "INVALID_RESPONSE" | "REQUEST_FAILED" | "TIMEOUT";

  constructor(code: ParcelLocatorError["code"], cause?: unknown) {
    super("The parcel locator request could not be completed.", { cause });
    this.name = "ParcelLocatorError";
    this.code = code;
  }
}

export interface ParcelLocator {
  findByIdentifier(identifier: string, signal?: AbortSignal): Promise<LocatedParcel | null>;
  findByPoint(
    longitude: number,
    latitude: number,
    signal?: AbortSignal,
  ): Promise<LocatedParcel | null>;
}
