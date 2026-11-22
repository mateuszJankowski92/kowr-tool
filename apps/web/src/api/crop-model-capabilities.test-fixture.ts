import { CROP_CATALOG, type Crop, type CropModelCapabilitiesResponse } from "@kowr/contracts";

// Deliberately small supported subset for UI states, not a second production mapping table.
const speciesReferences: Partial<Record<Crop, string>> = {
  "pszenica-zwyczajna-jara": "spring-wheat",
  "pszenica-zwyczajna-ozima": "winter-wheat",
  "kukurydza-na-ziarno": "grain-maize",
  ziemniak: "potato",
};
const approximateReferences: Partial<Record<Crop, string>> = {
  "pszenzyto-ozime": "winter-wheat",
  "zyto-ozime": "winter-rye",
  truskawka: "strawberry",
};

export const cropModelCapabilitiesFixture: CropModelCapabilitiesResponse = CROP_CATALOG.map(
  ({ id }) => {
    const species = speciesReferences[id];
    if (species) return { crop: id, kind: "species-reference", profileId: species };
    const approximate = approximateReferences[id];
    if (approximate) return { crop: id, kind: "approximate", profileId: approximate };
    return { crop: id, kind: "environment-only", profileId: null };
  },
);
