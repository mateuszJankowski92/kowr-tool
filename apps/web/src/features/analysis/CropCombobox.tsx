import {
  CROP_CATALOG,
  CROP_GROUPS,
  type Crop,
  type CropGroup,
  type CropModelCapability,
} from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Sprout } from "lucide-react";
import { useMemo, useState } from "react";
import { getCropModelCapabilities } from "../../api/crop-model-capabilities";
import { RetryButton } from "../../components/RetryButton";
import { Button } from "../../components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Spinner } from "../../components/ui/spinner";
import { getCropGroupIcon } from "./crop-icons";

const CROP_GROUP_ORDER = [
  "zboza",
  "oleiste",
  "okopowe",
  "motylkowate",
  "pastewne",
  "uzytki-zielone",
  "warzywa",
  "sady-plantacje-trwale",
  "ziola-przyprawy",
  "miododajne",
  "rosliny-ozdobne",
  "zagajniki",
  "ugory",
  "obszary-przyrodnicze",
  "brak",
] as const satisfies readonly CropGroup[];

type CropEntry = (typeof CROP_CATALOG)[number];
type CropGroupEntry = (typeof CROP_GROUPS)[number];

const CROP_BY_ID = new Map<Crop, CropEntry>(CROP_CATALOG.map((crop) => [crop.id, crop]));
const GROUP_BY_ID = new Map<CropGroup, CropGroupEntry>(
  CROP_GROUPS.map((group) => [group.id, group]),
);
const GROUPED_CROPS = CROP_GROUP_ORDER.map((groupId) => {
  const group = GROUP_BY_ID.get(groupId);

  if (!group) {
    throw new Error(`Missing crop group definition: ${groupId}`);
  }

  return {
    ...group,
    crops: CROP_CATALOG.filter((crop) => crop.group === group.id),
  };
});

const MODEL_LABELS: Record<CropModelCapability["kind"], string> = {
  "species-reference": "Model gatunkowy",
  approximate: "Model przybliżony",
  "environment-only": "Tylko warunki środowiskowe",
};

const MODEL_DESCRIPTIONS: Record<CropModelCapability["kind"], string> = {
  "species-reference":
    "Korzystamy z referencyjnych parametrów i faz rozwoju tej uprawy. Nie są to pomiary z działki ani kalibracja dla Polski.",
  approximate:
    "Korzystamy z parametrów podobnej uprawy lub przybliżonego kalendarza rozwoju. Wynik ma dodatkowe ograniczenia.",
  "environment-only":
    "Sprawdzisz dostępne dane środowiskowe, bez obliczenia niedoboru wody dla tej uprawy.",
};

function normalizeSearchValue(value: string): string {
  return value
    .toLocaleLowerCase("pl-PL")
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function filterCrop(value: string, search: string, keywords?: string[]): number {
  const crop = CROP_BY_ID.get(value as Crop);
  if (!crop) return 0;

  const group = GROUP_BY_ID.get(crop.group);
  const haystack = normalizeSearchValue(
    [crop.label, crop.sourceLabel, crop.sourceGroup, group?.label, ...(keywords ?? [])].join(" "),
  );
  const searchTerms = normalizeSearchValue(search).trim().split(/\s+/u).filter(Boolean);

  return searchTerms.every((term) => haystack.includes(term)) ? 1 : 0;
}

type CropComboboxProps = {
  describedBy?: string;
  id: string;
  onValueChange: (value: Crop) => void;
  value: Crop | "";
};

export function CropCombobox({ describedBy, id, onValueChange, value }: CropComboboxProps) {
  const [open, setOpen] = useState(false);
  const capabilities = useQuery({
    queryKey: ["crop-model-capabilities"],
    queryFn: ({ signal }) => getCropModelCapabilities(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const capabilityByCrop = useMemo(
    () => new Map(capabilities.data?.map((capability) => [capability.crop, capability])),
    [capabilities.data],
  );
  const selectedCrop = value ? CROP_BY_ID.get(value) : undefined;
  const selectedCapability = value ? capabilityByCrop.get(value) : undefined;
  const SelectedIcon = selectedCrop ? getCropGroupIcon(selectedCrop.group) : Sprout;
  const modelDescriptionId = `${id}-model`;

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-describedby={
              [describedBy, value || capabilities.isError ? modelDescriptionId : ""]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-expanded={open}
            className="mt-1.5 min-h-11 w-full justify-between gap-3 px-3 text-left font-normal shadow-sm"
            id={id}
            role="combobox"
            variant="outline"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <SelectedIcon
                aria-hidden="true"
                className={
                  selectedCrop
                    ? "size-4 shrink-0 text-primary"
                    : "size-4 shrink-0 text-muted-foreground"
                }
              />
              <span className={selectedCrop ? "truncate" : "truncate text-muted-foreground"}>
                {selectedCrop?.label ?? "Wybierz uprawę"}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-72 gap-0 p-0"
        >
          <Command filter={filterCrop} loop>
            <CommandInput autoFocus placeholder="Wyszukaj uprawę lub grupę…" />
            <CommandList>
              <CommandEmpty>
                Nie znaleziono takiej uprawy. Sprawdź pisownię lub wpisz nazwę grupy, np. zboża.
              </CommandEmpty>
              {GROUPED_CROPS.map((group) => {
                const GroupIcon = getCropGroupIcon(group.id);

                return (
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-2">
                        <GroupIcon aria-hidden="true" className="size-3.5" />
                        <span>{group.label}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground/75">
                          {group.crops.length}
                        </span>
                      </span>
                    }
                    key={group.id}
                  >
                    {group.crops.map((crop) => {
                      const CropIcon = getCropGroupIcon(crop.group);
                      const selected = crop.id === value;
                      const capability = capabilityByCrop.get(crop.id);
                      const modelLabel = capability
                        ? MODEL_LABELS[capability.kind]
                        : capabilities.isPending
                          ? "Sprawdzanie modelu…"
                          : "Brak informacji o modelu";

                      return (
                        <CommandItem
                          aria-label={`${crop.label}, ${group.label}, ${modelLabel}`}
                          aria-selected={selected}
                          key={crop.id}
                          keywords={[
                            crop.label,
                            crop.sourceLabel,
                            crop.sourceGroup,
                            group.label,
                            modelLabel,
                          ]}
                          onSelect={() => {
                            onValueChange(crop.id);
                            setOpen(false);
                          }}
                          value={crop.id}
                        >
                          <CropIcon
                            aria-hidden="true"
                            className="size-4 shrink-0 text-primary/80"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{crop.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {group.label} ·{" "}
                              {capabilities.isPending ? (
                                <span className="inline-block h-3 w-24 animate-pulse rounded bg-secondary align-middle motion-reduce:animate-none">
                                  <span className="sr-only">{modelLabel}</span>
                                </span>
                              ) : (
                                modelLabel
                              )}
                            </span>
                          </span>
                          <Check
                            aria-hidden="true"
                            className={
                              selected ? "size-4 shrink-0 opacity-100" : "size-4 shrink-0 opacity-0"
                            }
                          />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {(value || capabilities.isError) && (
        <div
          className="mt-2 text-xs leading-5 text-muted-foreground"
          id={modelDescriptionId}
          role={capabilities.isPending ? undefined : "status"}
        >
          {capabilities.isPending ? (
            <Spinner label="Sprawdzam dostępność modelu dla wybranej uprawy…" />
          ) : capabilities.isError ? (
            <>
              <p>
                Nie udało się sprawdzić dostępności modeli. Zakres obliczeń poznasz w wyniku
                analizy.
              </p>
              <RetryButton
                className="mt-3"
                isRetrying={capabilities.isFetching}
                onRetry={() => void capabilities.refetch()}
              >
                Sprawdź modele ponownie
              </RetryButton>
            </>
          ) : selectedCapability ? (
            <p>
              <span className="font-semibold text-foreground">
                {MODEL_LABELS[selectedCapability.kind]}.{" "}
              </span>
              {MODEL_DESCRIPTIONS[selectedCapability.kind]}
            </p>
          ) : (
            <p>
              Brak informacji o modelu wybranej uprawy. Zakres obliczeń poznasz w wyniku analizy.
            </p>
          )}
        </div>
      )}
    </>
  );
}
