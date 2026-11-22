import { writeFile } from "node:fs/promises";

const WFS_ENDPOINT = "https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_2025/wfs";
const FEATURE_TYPE = "gsa_public:uprawy_rolne_2025";
const SOURCE_FIELD = "roslina";
const SOURCE_GROUP_FIELD = "grupa_roslin";
const OUTPUT_PATH = new URL("../packages/contracts/src/crops.ts", import.meta.url);

function createCqlStringLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function fetchNextCrop(afterLabel) {
  const searchParams = new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    version: "2.0.0",
    typeNames: FEATURE_TYPE,
    propertyName: `${SOURCE_FIELD},${SOURCE_GROUP_FIELD}`,
    sortBy: SOURCE_FIELD,
    count: "1",
    outputFormat: "application/json",
  });

  if (afterLabel) {
    searchParams.set("cql_filter", `${SOURCE_FIELD} > ${createCqlStringLiteral(afterLabel)}`);
  }

  const response = await fetch(`${WFS_ENDPOINT}?${searchParams}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`ARiMR WFS returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const properties = payload.features?.[0]?.properties;
  const sourceLabel = properties?.[SOURCE_FIELD];
  const sourceGroup = properties?.[SOURCE_GROUP_FIELD];

  if (typeof sourceLabel !== "string" || sourceLabel.trim().length === 0) return null;

  return {
    sourceGroup:
      typeof sourceGroup === "string" && sourceGroup.trim().length > 0
        ? sourceGroup
        : "uprawa nieoznaczona",
    sourceLabel,
  };
}

async function fetchCrops() {
  const crops = [];
  let currentLabel = "";

  for (let index = 0; index < 2_000; index += 1) {
    const nextCrop = await fetchNextCrop(currentLabel);

    if (nextCrop === null) return crops;
    if (nextCrop.sourceLabel === currentLabel) {
      throw new Error("ARiMR WFS did not advance to the next crop label.");
    }

    crops.push(nextCrop);
    currentLabel = nextCrop.sourceLabel;
  }

  throw new Error("Crop catalog exceeded the safety limit of 2,000 unique labels.");
}

function createDisplayLabel(sourceLabel) {
  const normalized = sourceLabel.replaceAll("_", " ").replace(/\s+/gu, " ").trim();
  return normalized.replace(/^\p{Ll}/u, (firstLetter) => firstLetter.toLocaleUpperCase("pl-PL"));
}

function createGroupDisplayLabel(sourceGroup) {
  const labels = {
    brak: "Nieoznaczone",
    "sady plantacje trwałe": "Sady i plantacje trwałe",
    "zioła przyprawy": "Zioła i przyprawy",
  };

  return labels[sourceGroup] ?? createDisplayLabel(sourceGroup);
}

function createBaseId(sourceLabel) {
  return sourceLabel
    .toLocaleLowerCase("pl-PL")
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function getPrimarySourceGroup(sourceGroup) {
  return sourceGroup.split(",", 1)[0]?.trim() || "uprawa nieoznaczona";
}

function createCatalog(sourceCrops) {
  const idOccurrences = new Map();
  const groups = [
    ...new Set(sourceCrops.map(({ sourceGroup }) => getPrimarySourceGroup(sourceGroup))),
  ]
    .toSorted((left, right) =>
      createDisplayLabel(left).localeCompare(createDisplayLabel(right), "pl-PL"),
    )
    .map((sourceLabel) => ({
      id: createBaseId(sourceLabel) || "uprawa-nieoznaczona",
      label: createGroupDisplayLabel(sourceLabel),
      sourceLabel,
    }));
  const groupIds = new Map(groups.map(({ id, sourceLabel }) => [sourceLabel, id]));

  const crops = sourceCrops
    .toSorted((left, right) =>
      createDisplayLabel(left.sourceLabel).localeCompare(
        createDisplayLabel(right.sourceLabel),
        "pl-PL",
      ),
    )
    .map(({ sourceGroup, sourceLabel }) => {
      const baseId = createBaseId(sourceLabel) || "uprawa";
      const primarySourceGroup = getPrimarySourceGroup(sourceGroup);
      const occurrence = (idOccurrences.get(baseId) ?? 0) + 1;
      idOccurrences.set(baseId, occurrence);

      return {
        group: groupIds.get(primarySourceGroup),
        id: occurrence === 1 ? baseId : `${baseId}-${occurrence}`,
        label: createDisplayLabel(sourceLabel),
        sourceGroup,
        sourceLabel,
      };
    });

  return { crops, groups };
}

function renderCatalog({ crops, groups }) {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const groupEntries = groups
    .map(({ id, label, sourceLabel }) => {
      const singleLine = `  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(label)}, sourceLabel: ${JSON.stringify(sourceLabel)} },`;
      if (singleLine.length <= 100) return singleLine;

      return `  {
    id: ${JSON.stringify(id)},
    label: ${JSON.stringify(label)},
    sourceLabel: ${JSON.stringify(sourceLabel)},
  },`;
    })
    .join("\n");
  const cropEntries = crops
    .map(({ group, id, label, sourceGroup, sourceLabel }) => {
      const singleLine = `  { group: ${JSON.stringify(group)}, id: ${JSON.stringify(id)}, label: ${JSON.stringify(label)}, sourceGroup: ${JSON.stringify(sourceGroup)}, sourceLabel: ${JSON.stringify(sourceLabel)} },`;
      if (singleLine.length <= 100) return singleLine;

      return `  {
    group: ${JSON.stringify(group)},
    id: ${JSON.stringify(id)},
    label: ${JSON.stringify(label)},
    sourceGroup: ${JSON.stringify(sourceGroup)},
    sourceLabel: ${JSON.stringify(sourceLabel)},
  },`;
    })
    .join("\n");

  return `import { z } from "zod";

// Generated by scripts/update-crop-catalog.mjs from distinct ARiMR GSA 2025 values.
export const CROP_CATALOG_SOURCE = {
  provider: "ARiMR",
  dataset: "Deklaracje rolne 2025 - uprawy (GSA)",
  campaign: 2025,
  field: "roslina",
  groupField: "grupa_roslin",
  retrievedAt: ${JSON.stringify(retrievedAt)},
  url: ${JSON.stringify(WFS_ENDPOINT)},
} as const;

export const CROP_GROUPS = [
${groupEntries}
] as const;

export const CROP_CATALOG = [
${cropEntries}
] as const;

export type Crop = (typeof CROP_CATALOG)[number]["id"];
export type CropGroup = (typeof CROP_GROUPS)[number]["id"];

const cropIds = CROP_CATALOG.map(({ id }) => id) as [Crop, ...Crop[]];

export const CropSchema = z.enum(cropIds);
`;
}

const sourceCrops = await fetchCrops();
const catalog = createCatalog(sourceCrops);

await writeFile(OUTPUT_PATH, renderCatalog(catalog), "utf8");
process.stdout.write(
  `Updated crop catalog with ${catalog.crops.length} crops in ${catalog.groups.length} groups.\n`,
);
