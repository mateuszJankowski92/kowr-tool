# Crop catalog coverage review

Snapshot: 2026-11-22, ARiMR 2025 catalog, 679 entries. The user requested a review of
unmapped plants and defensible reuse of existing models. This is a project decision;
model availability does not mean local agronomic validation.

Latest owner-authorized policy: **678 of 679 entries** have a calculation profile, using 61
reference profiles and nine project estimation envelopes. The original 156 mappings are preserved;
522 additional identifiers use explicit group estimates. The current inventory contains 58 species
references, 620 approximate models and one environmental-only entry (`pieczarka`, mushrooms),
for which outdoor plant root-zone modelling does not apply. The sections below preserve the
earlier review and explain why these new estimates need explicit assumptions rather than a claim
of species validation. See [group estimation methodology](water-situation-methodology.md#group-estimates-when-species-references-are-missing-2026-11-22)
for parameter references, scenario envelopes and assumed calendars. Both analysis APIs require
`crop.modelKind`; current, historical and printed results expose approximation.

The [complete inventory](crop-catalog-review.csv) contains one row per catalog identifier,
its current profile or missing inputs, mapping basis, and profile limitations. Original
Polish catalog labels are retained. Unmapped entries received a requirements triage;
this is not a completed literature review of every species. The previous 132 mappings
are preserved and identified as existing references, not independently revalidated here.

## First implemented extension

The first extension increased coverage from **132 to 148 identifiers**, using **55 profiles instead of 48**.
Lookup remains an explicit identifier list. No fuzzy or name-fragment mapping runs in production.

| Catalog identifiers                                                            | Profile            | Basis and limitations                                                                           |
| ------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| `pszenica-orkisz-jary`, `pszenica-plaskurka-jara`, `pszenica-samopsza-jara`    | spring wheat       | Common-wheat group proxy; species-specific roots, coefficients and phenology are not validated. |
| `pszenica-orkisz-ozimy`, `pszenica-plaskurka-ozima`, `pszenica-samopsza-ozima` | winter wheat       | Same proxy with the winter calendar preserved.                                                  |
| `kukurydza-na-kiszonke`                                                        | silage maize       | Separate 2025 FAO row, including Kc end 0.95; explicitly adapted maize phase calendar.          |
| `batat`                                                                        | sweet potato       | Own FAO parameters and 1998 phase example; project planting date.                               |
| `por`                                                                          | leek               | Own FAO parameters; onion phase proxy.                                                          |
| `pasternak-zwyczajny`                                                          | parsnip            | Own FAO parameters; carrot phase proxy.                                                         |
| `brukiew`, `brukiew-jadalna`, `brukiew-pastewna`                               | rutabaga for roots | Own FAO parameters; carrot phase proxy for root harvest.                                        |
| `rzepa-jadalna`, `rzepa-pastewna`                                              | turnip for roots   | Own FAO parameters; crucifer phase proxy. Stubble turnip is excluded.                           |
| `krokosz-barwierski`                                                           | safflower          | Own FAO parameters and 1998 phase example; project sowing date.                                 |

New coefficients, maximum root depths and depletion fractions come from FAO-56 revised
edition (2025), Tables 6.1, 6.2, 8.1 and 8.2. Phenology remains an older reference or an
explicit project adaptation. Details, source links and the silage calendar assumption are in
[the methodology](water-situation-methodology.md#crop-profiles). The original profiles are
not silently migrated to the revised parameter tables. The API includes mapping assumptions
in both current and ten-year historical assessments; the report's existing profile details
display them. Missing data or scenario disagreement can still produce a partial result.

## Priority extension and selection labels

The second user-authorized extension adds **8 identifiers**, reaching **156 of 679**, with
**61 reference profiles**. New profiles cover spring/winter rye, winter barley, spring rape,
common buckwheat and established open-field strawberry. Spring/winter triticale use explicit
common-wheat group proxies matching their seasonal form. Other rye types, Tartary buckwheat,
green-manure use and unspecified mixtures are not automatically assigned these profiles.

Winter rye and barley have their own 2025 FAO water parameters and a borrowed cold-season
winter-wheat calendar. Spring rye borrows spring-cereal phases. Spring rape has a distinct
spring calendar anchored to COBORU PDO Oleiste 2024 Table 5 trial means. Common buckwheat
uses an 85-day project calendar informed by FAO EcoCrop; individual phases remain adapted.
Strawberry uses its own 1998 FAO parameters (roots 0.2–0.3 m, p 0.20), with an assumed 210-day
established-canopy season. Strawberry water use after fruit harvest is not equated to absence
of fruit, and a berry-bush rooting depth is not substituted. See the methodology for sources
and boundaries; these calendars are not field validation.

`GET /api/crops` derives availability from the same domain mappings used by the calculations.
Every catalog crop has exactly one transport-validated entry. Selection shows these labels,
including when ARiMR or the URL supplies the selected crop:

| API kind            | Selection label            | Meaning                                                                                               |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `species-reference` | Model gatunkowy            | Published species/use parameters and an own-species phase reference; still not calibrated for Poland. |
| `approximate`       | Model przybliżony          | Related-species/harvest-use parameters or an explicitly adapted phase calendar.                       |
| `environment-only`  | Tylko warunki środowiskowe | No crop-water profile; available environmental evidence only.                                         |

The snapshot contains 58 species references, 98 approximate references and 523 environmental-only
entries. This classifies the strength of the assigned references, not confidence in a parcel result.
A fetch failure is shown as unknown availability with a retry action, never as environmental-only.
All catalog choices remain selectable. The capability client rejects incomplete or duplicate metadata.
Existing mappings are labelled conservatively where another species, harvest use or phase reference
is borrowed; their numeric parameters are preserved.

## Previous triage of the remaining 523 entries

Counts below are mutually exclusive first missing-input categories for planning, not claims
that resolving one item completes a model. Each inventory row records its current reason.

| Next requirement                                                              | Entries |
| ----------------------------------------------------------------------------- | ------: |
| Reviewed species parameters and phenology, including honey-producing uses     |     318 |
| Production calendar: cuts, regrowth, seed harvest or green-manure termination |     102 |
| Mixture composition or support-crop management                                |      57 |
| Perennial canopy, stand and root-zone assumptions                             |      33 |
| Correct spring/winter/stubble reference                                       |       4 |
| More precise crop identity                                                    |       4 |
| Land-cover model rather than a harvested-crop profile                         |       5 |

The priority extension implements rye, winter barley, triticale, common buckwheat,
spring rape and strawberry. Further expansion should prioritize reviewed forage-grass,
alfalfa and clover models after introducing management inputs. Grasses and legume forage
need mowing/grazing, cutting and regrowth inputs; mixtures need their composition.
Seed production and green manure must not inherit a fresh-harvest
or dry-grain calendar solely because the plant name matches.

Hemp cultivar names illustrate why a lexical match is unsafe: the FAO entry “sunn hemp”
is Crotalaria juncea, whereas Polish hemp cultivars are Cannabis sativa. Likewise, a berry
bush profile does not establish strawberry rooting depth, and an orchard profile does not
establish water requirements for woody coppice or a nursery.

Species-specific crop-water calculations still require additional reference data and, for some
entries, new management inputs and domain behavior. The latest owner-authorized policy provides
explicit group-based estimates while retaining these limitations in the inventory and response
assumptions. It does not establish species validation, actual mixture composition, cutting dates,
stand age or crop termination. Source-data gaps remain gaps.
