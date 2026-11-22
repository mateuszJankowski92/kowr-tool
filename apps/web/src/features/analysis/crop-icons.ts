import type { CropGroup } from "@kowr/contracts";
import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Bean,
  Carrot,
  CircleHelp,
  Flower2,
  LandPlot,
  Leaf,
  Salad,
  Sprout,
  Trees,
  Wheat,
} from "lucide-react";

const GROUP_ICONS = {
  brak: CircleHelp,
  miododajne: Flower2,
  motylkowate: Bean,
  "obszary-przyrodnicze": LandPlot,
  okopowe: Carrot,
  oleiste: Flower2,
  pastewne: Sprout,
  "rosliny-ozdobne": Flower2,
  "sady-plantacje-trwale": Apple,
  ugory: LandPlot,
  "uzytki-zielone": Sprout,
  warzywa: Salad,
  zagajniki: Trees,
  zboza: Wheat,
  "ziola-przyprawy": Leaf,
} satisfies Partial<Record<CropGroup, LucideIcon>>;

export function getCropGroupIcon(group: CropGroup): LucideIcon {
  return GROUP_ICONS[group as keyof typeof GROUP_ICONS] ?? CircleHelp;
}
