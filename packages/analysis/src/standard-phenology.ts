import { ADDITIONAL_STANDARD_SEASON_STARTS } from "./additional-crop-water-profiles.js";
import type { CropWaterProfileId } from "./crop-water-profiles.js";
import { ESTIMATED_STANDARD_SEASON_STARTS } from "./estimated-crop-profiles.js";

export const STANDARD_SEASON_START_SOURCE = {
  provider: "Centrum Doradztwa Rolniczego w Brwinowie",
  dataset: "Normatywy Produkcji Rolniczej",
  interpretation:
    "Project-selected representative date for central Poland, derived from the published sowing or planting period.",
  sourceUrl: "https://poznan.cdr.gov.pl/normatywy/",
} as const;

type StandardSeasonStartAssumption = {
  monthDay: `${string}-${string}`;
  description: string;
};

export const STANDARD_SEASON_START_ASSUMPTIONS = {
  "winter-wheat": {
    monthDay: "09-25",
    description: "25 September, midpoint of the central-Poland 20-30 September sowing period",
  },
  "spring-wheat": {
    monthDay: "03-25",
    description: "25 March, midpoint of the central-Poland 20-30 March sowing period",
  },
  "grain-maize": {
    monthDay: "04-27",
    description: "27 April, representative date within the 20 April-5 May sowing period",
  },
  potato: {
    monthDay: "04-20",
    description: "20 April, representative date within the second-third decade planting period",
  },
  "sugar-beet": {
    monthDay: "04-30",
    description: "30 April, representative date within the third-April/first-May sowing period",
  },
  rapeseed: {
    monthDay: "08-20",
    description: "20 August, representative date within the August sowing period",
  },
  ...ADDITIONAL_STANDARD_SEASON_STARTS,
  ...ESTIMATED_STANDARD_SEASON_STARTS,
} as const satisfies Record<CropWaterProfileId, StandardSeasonStartAssumption>;

function requireCalendarDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("analysisDate must use YYYY-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError("analysisDate must be a valid calendar date.");
  }
}

export function getStandardSeasonStartDate(
  cropProfileId: CropWaterProfileId,
  analysisDate: string,
): string {
  requireCalendarDate(analysisDate);
  const assumption = STANDARD_SEASON_START_ASSUMPTIONS[cropProfileId];
  const analysisYear = Number(analysisDate.slice(0, 4));
  const sameYearCandidate = `${analysisYear}-${assumption.monthDay}`;
  return sameYearCandidate <= analysisDate
    ? sameYearCandidate
    : `${analysisYear - 1}-${assumption.monthDay}`;
}
