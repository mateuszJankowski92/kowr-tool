import type { CropWaterProfile } from "./crop-water-profiles.js";

type EstimatedProfileInput = {
  coefficients: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  roots: readonly [number, number];
  depletion: number;
  stages: readonly [number, number, number, number];
  start: `${string}-${string}`;
  reference: string;
  perennial?: boolean;
  winter?: boolean;
};

function estimatedProfile<const Id extends string>(
  id: Id,
  label: string,
  input: EstimatedProfileInput,
) {
  const range = ([minimum, maximum]: readonly [number, number]) => ({ minimum, maximum });
  const [initialDays, developmentDays, midSeasonDays, lateSeasonDays] = input.stages;
  return {
    id,
    label,
    seasonType: input.perennial ? "perennial" : input.winter ? "winter" : "spring",
    iungCropGroup: "not-assigned",
    cropCoefficients: {
      initial: range(input.coefficients[0]),
      midSeason: range(input.coefficients[1]),
      lateSeason: range(input.coefficients[2]),
    },
    maximumRootDepthMeters: range(input.roots),
    depletionFractionAtFiveMillimetersPerDay: input.depletion,
    stageDurationReferences: [
      {
        context:
          "Project screening calendar; sowing, canopy development and termination are assumed.",
        durations: { initialDays, developmentDays, midSeasonDays, lateSeasonDays },
        use: "reference-only-not-poland-calibrated",
        source: "project-adapted-reference",
      },
    ],
    standardSeasonStart: input.start,
    limitations: [
      input.reference,
      "Project group estimate, not measured or validated parameters for the selected species. Parameter endpoints form sensitivity scenarios, not confidence intervals.",
      "The calendar and initial 0.2 m root depth are project assumptions. Actual establishment, harvest, cutting, regrowth, stand density and mixture composition are unknown.",
      "FAO-56 (1998), Chapter 6, Tables 11/12 and Chapter 8, Table 22 supply the reference families. https://www.fao.org/4/X0490E/x0490e0b.htm https://www.fao.org/4/x0490E/x0490e0e.htm",
    ],
  } as const satisfies CropWaterProfile & { standardSeasonStart: `${string}-${string}` };
}

// These are explicit, user-authorized screening envelopes, not additional FAO species rows.
// A single seasonal curve averages cutting effects as described in FAO-56 Chapter 6.
export const ESTIMATED_CROP_WATER_PROFILES = [
  estimatedProfile("estimated-annual-legume", "Estimated annual forage legume", {
    coefficients: [
      [0.4, 0.4],
      [0.9, 1.15],
      [0.5, 0.85],
    ],
    roots: [0.3, 1],
    depletion: 0.5,
    stages: [20, 30, 60, 30],
    start: "04-01",
    reference:
      "Berseem clover forage Kc and p proxy; late-season envelope includes seed/forage termination. Serradella root envelope uses IOR-PIB (2018), pp. 21-22: about 0.3-0.4 m on poor soils and up to about 1 m on fertile soils. https://www.ior.poznan.pl/plik,3687,metodyka-integrowanej-ochrony-seradeli-siewnej-dla-doradcow-pdf.pdf",
  }),
  estimatedProfile("estimated-legume-seed", "Estimated legume seed crop", {
    coefficients: [
      [0.4, 0.4],
      [0.5, 1.15],
      [0.3, 0.5],
    ],
    roots: [0.3, 1],
    depletion: 0.5,
    stages: [20, 35, 65, 30],
    start: "04-01",
    reference:
      "Screening envelope between FAO alfalfa seed and clover/pulse coefficients. Root envelope is borrowed from the annual-legume estimate; seed harvest and a 150-day spring calendar are assumptions, not a measured seed-production cycle.",
  }),
  estimatedProfile("estimated-perennial-legume", "Estimated established forage legume", {
    coefficients: [
      [0.4, 0.4],
      [0.9, 1.2],
      [0.85, 1.1],
    ],
    roots: [0.6, 2],
    depletion: 0.5,
    stages: [20, 30, 130, 30],
    start: "04-01",
    perennial: true,
    reference:
      "Clover/alfalfa forage Kc and root-depth envelope; p is borrowed from clover. Established spring canopy and seasonal average cutting effects are assumed; individual cutting and regrowth cycles are not reconstructed.",
  }),
  estimatedProfile("estimated-grass", "Estimated grass and pasture cover", {
    coefficients: [
      [0.3, 0.95],
      [0.75, 1.05],
      [0.75, 1],
    ],
    roots: [0.5, 1.5],
    depletion: 0.6,
    stages: [20, 30, 130, 30],
    start: "04-01",
    perennial: true,
    reference:
      "FAO pasture/ryegrass Kc envelope and pasture roots/p. The season averages grazing and cutting effects; grazing intensity, grass species and stand age are not known.",
  }),
  estimatedProfile("estimated-herbaceous", "Estimated herbaceous crop cover", {
    coefficients: [
      [0.3, 0.6],
      [0.85, 1.15],
      [0.5, 1.1],
    ],
    roots: [0.3, 0.8],
    depletion: 0.4,
    stages: [20, 35, 95, 30],
    start: "04-15",
    reference:
      "Broad herbaceous screening envelope anchored to FAO mint, leafy-vegetable and berry Kc; roots/p borrow the mint reference with a shallow-root sensitivity endpoint. This is a canopy analogue, not a botanical or species-specific match.",
  }),
  estimatedProfile("estimated-mixture", "Estimated mixed herbaceous stand", {
    coefficients: [
      [0.3, 0.5],
      [0.9, 1.2],
      [0.4, 1],
    ],
    roots: [0.5, 1.5],
    depletion: 0.5,
    stages: [20, 30, 70, 30],
    start: "04-01",
    reference:
      "Screening envelope combining cereal, pulse and forage reference canopies. Roots span pasture and cereal references; p=0.5 is a project reference. No species shares or weighted crop coefficients are inferred from a mixture label.",
  }),
  estimatedProfile("estimated-green-manure", "Estimated summer cover crop", {
    coefficients: [
      [0.3, 0.5],
      [0.9, 1.15],
      [0.85, 1],
    ],
    roots: [0.3, 1],
    depletion: 0.5,
    stages: [15, 25, 35, 15],
    start: "07-25",
    reference:
      "Legume/crucifer cover analogue with an assumed 90-day summer establishment-to-termination period. No seed-maturity calendar or actual incorporation date is inferred. A green-manure crop sown in spring requires a user-supplied calendar for date-specific use.",
  }),
  estimatedProfile("estimated-winter-cover", "Estimated overwintering cover", {
    coefficients: [
      [0.4, 0.7],
      [0.9, 1.15],
      [0.85, 1],
    ],
    roots: [0.3, 1.5],
    depletion: 0.5,
    stages: [160, 75, 40, 20],
    start: "09-15",
    winter: true,
    reference:
      "Winter-wheat cold-season phase analogue with cover-crop Kc/root envelope. Establishment in September and termination in the following summer are project assumptions; snow, dormancy and a multi-year crop cycle are not simulated.",
  }),
  estimatedProfile("estimated-unmanaged-cover", "Estimated unspecified vegetation cover", {
    coefficients: [
      [0.3, 0.95],
      [0.3, 1.05],
      [0.3, 1],
    ],
    roots: [0.2, 1.5],
    depletion: 0.6,
    stages: [20, 30, 130, 30],
    start: "04-01",
    perennial: true,
    reference:
      "Sparse-to-dense pasture vegetation proxy for fallow/nature areas. Vegetation is assumed; the result does not establish actual cover, bare-soil evaporation or the requirements of a harvested crop.",
  }),
] as const;

export const ESTIMATED_STANDARD_SEASON_STARTS = Object.fromEntries(
  ESTIMATED_CROP_WATER_PROFILES.map(({ id, standardSeasonStart }) => [
    id,
    {
      monthDay: standardSeasonStart,
      description: "Project reference calendar for a group estimate; not an observed sowing date.",
    },
  ]),
) as Record<
  (typeof ESTIMATED_CROP_WATER_PROFILES)[number]["id"],
  {
    monthDay: `${string}-${string}`;
    description: string;
  }
>;
