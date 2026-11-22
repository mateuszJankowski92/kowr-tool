# Water situation assessment methodology

## Status and scope

This document fixes the scientific and decision rules for the first implementation of the
KOWR Water Assistant water-situation assessment. The deterministic FAO-56 season engine is
connected to the existing parcel, weather, SoilGrids, and optional satellite integrations and is
exposed through the API. The report integration accepts an optional user-supplied season start and presents
the central response as the first report section. Historical susceptibility remains a separate API
flow. The current implementation also generates evidence-linked screening recommendations;
report export remains outside this stage.

The assessment answers a conditional question: do the available data and declared assumptions
indicate crop water stress on the requested date? It is not a direct soil-moisture measurement,
an official agricultural-drought declaration, or an irrigation prescription.

## Method selected for the MVP

The core is a daily FAO-56 root-zone water balance evaluated as an ensemble of explicit
scenarios. IUNG agricultural-drought monitoring is an external reference for validation, not a
source of thresholds copied into a different indicator. Qualified Sentinel-2 observations may
corroborate or contradict the core result, but do not replace the balance.

This structure avoids an arbitrary weighted score. A modelled physical state drives the result;
uncertain inputs create alternative scenarios, and the assessment reports whether those
scenarios agree.

## Continuous daily history

### Required time series

FAO-56 water stress depends on root-zone depletion carried over from the preceding day. A short
aggregate such as precipitation minus ET0 over the report range cannot reconstruct that state.
Each scenario therefore requires one gap-free daily sequence from its crop-season start through
the requested date, containing at least:

- precipitation in millimetres;
- FAO-56 reference evapotranspiration ET0 in millimetres;
- the date and provenance of every observation;
- a daily crop coefficient and effective rooting depth derived from the scenario's phenology.

The Stage 2 domain engine accepts the complete normalized sequence and checks every required date
from each scenario start through the analysis date. A missing date or missing precipitation/ET0
value is not zero and makes the affected scenario incomplete. Stage 2 left fetching the union of
required dates, caching records, and enforcing one consistent weather provider to API
orchestration.

Stage 3 implements that orchestration for one requested season. The API requests one continuous
range from the earliest requested phenology scenario through the analysis date when at least one
scenario is active. Inactive alternatives remain incomplete required scenarios rather than being
silently dropped. Open-Meteo ERA5 is tried first. Standalone ERA5-Land was removed because it
returned null precipitation and ET0 even for archived dates with available temperature. If the
whole range is incomplete and starts in 2017 or later, the assessment may use one complete ECMWF
IFS operational-analysis range before trying NASA POWER. IFS is a separately identified model
whose versions change over time, not a continuation of the ERA5 reanalysis. A failure or incomplete range may trigger one request for the entire same range
from NASA POWER; values from the two providers are never spliced into one balance. Missing dates
are materialized as `null`, not zero. The provider time standard, retrieval time, attempted roles,
and exact data range are returned with the result.

When the selected date has incomplete weather, the API may propose the last day in the continuous
weather prefix only after rerunning the full scenario ensemble for that day. The proposal is
omitted unless every scenario for the earlier date completes. Selecting it is an explicit user
action that starts a new assessment; it does not change the date of the existing result.

Weather adapters retain complete responses in a bounded, process-local 30-minute cache and can
reuse a complete containing range for a narrower request at the same coordinates. Partial and
failed responses are not retained. Each provider limits concurrent requests and temporarily
suppresses further calls after rate limiting. This cache is not shared between API processes or
preserved on restart.

### Start date and unknown initial depletion

The preferred start is a supplied or independently sourced sowing/emergence date. A calendar date
alone does not establish crop stage. When the start or initial root-zone depletion is unknown,
the engine must not invent one value. It runs documented phenology candidates and brackets the
initial depletion between the physical bounds:

- wet start: root-zone depletion `Dr = 0`;
- dry start: root-zone depletion `Dr = TAW`.

The bounds may converge after sufficient observed rainfall. If materially different plausible
initial-state or phenology scenarios still disagree on the requested date, the result is
`indeterminate`. There is no arbitrary fixed warm-up period that silently declares the initial
condition forgotten.

For a crop without a verified profile or usable phenology scenario, the core result is
`insufficient-data`. FAO-56 stage-duration examples from other climates are references for an
explicit scenario only; they are not presented as a Polish crop calendar.

### Daily balance and unobserved fluxes

For day `i`, FAO-56 Equation 85 is used:

```text
Dr,i = Dr,i-1 - (P - RO)i - Ii - CRi + ETc,adj,i + DPi
```

The state is limited to `0 <= Dr <= TAW`. Water above field capacity becomes deep percolation.
Wetting time is explicit. For `early-day` precipitation or irrigation, wetting first reduces the
start-of-day depletion and any excess drains; `Ks` is calculated from that wetted state. For
`late-day` wetting, `Ks` and evapotranspiration use the pre-wetting state and wetting is applied
after evapotranspiration. This follows FAO-56 Example 38 and prevents a daily total from silently
choosing an order that changes the stress result.

When the root zone grows, depletion is first adjusted using the water content of the newly rooted
soil:

```text
Dr,new = Dr,previous + 1000 * (thetaFC - thetaSubsoil) * deltaZr
```

The season engine keeps the initial root depth through the initial phase and interpolates it to
the selected maximum during development. Because the water content of newly rooted soil is not
observed, it is bracketed consistently with the initial-state scenario: field capacity in the wet
scenario and wilting point in the dry scenario. The resulting added depletion is reported for
every day rather than hidden in the state update.

The current integrations do not observe irrigation, runoff, or capillary rise. The first
operational run may calculate an explicitly labelled rainfed, full-infiltration scenario with
`I = 0`, `RO = 0`, and `CR = 0`; these are assumptions, not observations. Unknown irrigation can
make modelled stress too high, while ignored runoff can make it too low. Until these fluxes are
provided or bounded using additional data, they remain visible limitations and prevent an
unqualified claim about actual field moisture.

### Standard season-start assumption

The report does not require the farmer to know a sowing or planting date. By default, when
explicit phenology is absent, the API selects one documented project-standard date for the crop
profile and the most recent occurrence of that month and day not later than the analysis date.
An optional progressive-disclosure control lets the farmer supply a known sowing or planting date;
this remains an explicit scenario assumption and is not presented as a confirmed emergence date.
The standard dates are
representative points within central-Poland periods published in the Agricultural Production
Standards by the Agricultural Advisory Centre in Brwinów: 25 September for winter wheat, 25 March
for spring wheat, 27 April for grain maize, 20 April for potato, 30 April for sugar beet, and 20
August for rapeseed.

These are transparent prototype assumptions, not parcel observations, regional recommendations,
or confirmed emergence dates. Reference FAO-56 phase durations remain explicitly not calibrated
for Poland. An advanced API caller may still override the default with explicit phenology.
Winter rapeseed now uses an explicitly adapted reference calendar rather than an empty phase
list. INRAE CropWat 0.3.0 `SB2023-colza` supplies 15/165/61/37-day phase proportions from an
AqYield calibration in Aveyron, France. The prototype rescales those proportions to the 317 and
335-day full seasons observed in NE Poland (Jankowski et al., 2024, Table 2), giving
17/188/70/42 and 18/199/74/44 days. The last stage receives the rounding remainder so that totals
remain exact. Stretching a reference crop calendar to a local growing-period envelope is a
project screening assumption; it does not validate the individual phase dates or model winter
dormancy. Both variants retain FAO-56 rapeseed crop coefficients and rooting-depth ranges.
Responses label their origin `project-adapted-reference`, return the source versions and URLs,
and preserve the non-Polish phase-calibration limitation.

The report uses an initial effective root depth of 0.20 m. This is a documented project assumption
for the start of an annual-crop reference season, consistent with the 0.15–0.20 m lower range
reported for many annual crops in FAO-56 Annex 8. It is not a field measurement. Initial root-zone
water is still bracketed between wet and dry physical bounds, while maximum rooting-depth ranges
come from the verified crop profiles.

### Historical orchestration

The same continuous calculation is rerun for each analogous period in the preceding ten years.
For the oldest selectable analysis dates this can require weather archives reaching about twenty
years before the current date: ten years to select the event and ten earlier reference seasons.
The result reports the actual complete years used.

When historical crop rotation is unknown, these runs are counterfactual susceptibility tests for
the currently selected crop profile, not claims that this crop grew on the parcel in every year.
No satellite observation after the historical analysis date may contribute. Current SoilGrids
values used for a historical run must be disclosed as a non-historical soil model.

## FAO-56 stress calculation

The single-coefficient approach is used for the MVP because the available crop profiles provide
`Kc`, while the data needed to model basal transpiration and separate soil evaporation reliably
are not yet available.

For each root-zone layer:

```text
TAW = 1000 * (thetaFC - thetaWP) * Zr        FAO-56 Equation 82
RAW = p * TAW                               FAO-56 Equation 83
p   = pTable22 + 0.04 * (5 - ETc)           limited to 0.1..0.8
```

For `Dr <= RAW`, `Ks = 1`. For `Dr > RAW`:

```text
Ks = (TAW - Dr) / ((1 - p) * TAW)           FAO-56 Equation 84
ETc     = Kc * ET0
ETc,adj = Ks * Kc * ET0                     FAO-56 Equation 81
```

`Ks` is kept in the physical range 0–1. The daily balance uses `ETc,adj`, not potential `ETc`,
after stress begins. Using potential evapotranspiration after that point would over-deplete the
modelled root zone and diverge from FAO-56 Example 37.

FAO-56 presents the daily adjustment of `p` as an approximation and notes that a constant value is
also often used. The domain input therefore makes this choice explicit as `table-value` or
`adjust-for-etc`. The Example 37 regression uses its published constant `p = 0.40`; an operational
scenario may select the daily adjustment without changing the cited example inputs.

FAO-56 notes that the dual-coefficient form, `ETc,adj = (Ks Kcb + Ke) ET0`, is generally more
valid because stress affects transpiration rather than soil evaporation. The single-coefficient
form is a documented MVP approximation, especially uncertain after wetting or with sparse canopy.

## Field capacity from SoilGrids

Field capacity is a functional condition: water remaining after downward drainage has markedly
decreased. It is not represented by one universal matric potential for every soil. SoilGrids
provides modelled volumetric water content at 10 kPa (`wv0010`), 33 kPa (`wv0033`), and permanent
wilting point at 1500 kPa (`wv1500`). Choosing only 10 or only 33 kPa would hide a material,
soil-dependent assumption.

The MVP therefore preserves two named capacity scenarios:

- `10-kpa`: higher storage estimate, `wv0010 - wv1500`;
- `33-kpa`: lower storage estimate, `wv0033 - wv1500`.

SoilGrids stores these water layers in `10^-3 cm3/cm3`, equivalent to 1 mm of water per metre of
soil. The adapters divide the stored integer by 10 to expose volumetric percent: for example,
`400` becomes `40%`, or a volumetric fraction of `0.40`. Available water in a layer is then
`(fieldCapacityPercent - wiltingPointPercent) / 100 * thicknessCm * 10` millimetres.

The baseline uses the Q0.50 prediction in each SoilGrids depth layer, weighted by the part of that
layer intersected by the effective root zone. The 10 and 33 kPa results are alternative physical
definitions, not statistical confidence bounds. SoilGrids Q0.05 and Q0.95 remain provenance and
uncertainty inputs; later sensitivity runs must keep quantiles coherent instead of combining
unrelated extremes into an impossible profile.

SoilGrids is a 250 m model prediction at a representative parcel location, not an in-field
measurement or a parcel-wide survey. Restrictive horizons, compaction, drainage, stones, and a
shallower effective root zone can reduce usable storage. The FAO-56 root-depth range is therefore
also preserved rather than replaced with its maximum without evidence.

## Crop profiles

The six original pilot profiles remain unchanged. The extended set contains 61 reference profiles
and 156 explicit ARiMR mappings. The pilot profiles' `Kc`, maximum effective root depth, and depletion
fraction `p` are transcribed from FAO-56 Tables 12 and 22. Ranges are preserved when FAO gives a
range or variant; they are scenario inputs, not values to average silently.

| Profile         | Season | Kc initial |    Kc mid |   Kc late | Root depth (m) | p at ETc about 5 mm/day |
| --------------- | ------ | ---------: | --------: | --------: | -------------: | ----------------------: |
| Winter wheat    | winter |  0.40–0.70 |      1.15 | 0.25–0.40 |        1.5–1.8 |                    0.55 |
| Spring wheat    | spring |       0.30 |      1.15 | 0.25–0.40 |        1.0–1.5 |                    0.55 |
| Grain maize     | spring |       0.30 |      1.20 | 0.35–0.60 |        1.0–1.7 |                    0.55 |
| Potato          | spring |       0.50 |      1.15 | 0.40–0.75 |        0.4–0.6 |                    0.35 |
| Sugar beet      | spring |       0.35 |      1.20 | 0.70–1.00 |        0.7–1.2 |                    0.55 |
| Rapeseed/canola | winter |       0.35 | 1.00–1.15 |      0.35 |        1.0–1.5 |                    0.60 |

FAO-56 Table 11 examples are marked `reference-only-not-poland-calibrated`. The additional
profiles cover faba/broad bean, beans and pulses, soybean, lentil, chickpea, sunflower, flax,
barley, oats, millet, sorghum, sweet maize, vegetables, deciduous orchards, grapes, hops, berries
and mint. Dry-seed faba bean uses Kc 0.50/1.15/0.30, roots 0.5–0.7 m and p 0.45, with the
20/30/35/15-day March/April Mediterranean phase example. Its 25 March default start is a project
assumption, not an observed Polish harvest calendar. Fresh broad bean uses its separate fresh
harvest Kc end value of 1.10.

Published parameter ranges remain ranges. Chickpea uses an explicitly adapted pulse phase
calendar, garlic an onion phase calendar, stone fruit and berries a deciduous-canopy reference,
and mint a project 210-day reference season without observed cuts. These phase proxies are
labelled `project-adapted-reference`, never claimed to be species-specific Table 11 rows.
Additional default starts are transparent project reference dates for a temperate season;
the six pilot defaults retain their CDR derivation. Orchards assume established trees with active
ground cover and killing frost; grapes use the wine-grape row. Ground cover, density, cultivar,
stand age and actual phases are not observed. Established perennials retain the scenario's
mature rooting depth throughout canopy development, rather than regrowing roots from 0.2 m.
Rapeseed uses the separately sourced adaptation described above. Operational Polish phenology
still requires local observations or calibration.

The 2026-11-22 catalog extension adds seven profiles using **FAO-56 revised edition (2025)**:
Tables 6.1/8.1 for sweet potato, leek, parsnip, rutabaga and turnip; Tables 6.2/8.2 for
silage maize and safflower. These supply Kc, rooting depth and depletion fraction only; existing
profiles retain their earlier parameter edition. The 2025 edition is identified by
[DOI 10.4060/cd6621en](https://doi.org/10.4060/cd6621en); the publisher's PDF was read from
[the University of Pisa author-hosted copy](https://agrhysmo.agr.unipi.it/wp-content/uploads/2025/09/FAO56%202025.pdf),
printed pages 165–169 and 258–260.

Sweet potato and safflower use their own 1998 Table 11 stage examples. Leek uses the dry-onion
phase example, parsnip and rutabaga the carrot example, and root turnip the crucifer example.
The silage calendar is a project 140-day proxy adapted from the 150-day spring field-maize
example by shortening the final phase by ten days. This is a screening assumption, not an
observed or validated silage harvest calendar. Its late-season Kc is 0.95, not the grain-harvest
coefficient. Stubble turnip remains unmapped because its calendar differs. All these reference
starts and proxy phases can differ substantially from actual sowing and harvest dates.

Six explicit spring/winter spelt, emmer and einkorn identifiers now use the corresponding
common-wheat profile as a **project crop-group proxy**, not a species-specific calibration.
This does not establish equivalent root systems or phenology. Both the central and historical
API responses include the mapping basis alongside profile limitations in `crop.profileAssumptions`.
See the [full catalog triage](crop-catalog-review.md) for the exact identifiers and remaining gaps.

The subsequent priority extension adds eight catalog mappings and six profiles. Rye (spring and
winter), winter barley, spring rape and common buckwheat use the revised 2025 Tables 6.2/8.2
parameter rows. Rye uses Kc 0.30/1.00/0.25, roots 0.6–1.2 m and p 0.55; barley uses
0.30/1.10/0.25 with the same rooting range and p. Canola uses 0.50/1.10/0.35, roots 0.8–1.3 m
and p 0.50. Common buckwheat uses 0.30/1.05/0.25, roots 0.6–1.2 m and p 0.55.
The canola row is a species reference, not a separate spring-form calibration.

Winter rye/barley borrow the 160/75/75/25-day cold-season winter-wheat reference from FAO-56
(1998), Table 11, with project starts 20/15 September. These calendars do not establish species
harvest dates or simulate frozen soil, snow or winter survival. Spring rye borrows the
20/25/60/30-day spring-cereal example, with a project 25 March start. Spring/winter triticale
use the existing common-wheat profile of the same seasonal form as an explicit group proxy.

Spring rape uses a separate 20/32/57/20-day project calendar with a 10 April reference start.
The anchors are the 2024 trial means for sowing (10 April), flowering onset (31 May), technical
maturity (27 July) and harvest (16 August) in [COBORU PDO Oleiste 2024, Table 5, printed page 34](https://coboru.gov.pl/Publikacje_COBORU/Wyniki_PDO/WPDO_220_Oleiste_2024.pdf).
The initial 20 days are assumed; flowering and technical maturity approximate the FAO canopy
boundaries, which COBORU did not measure here. These are screening phase allocations, not local
canopy calibration, and the same default is a project reference when analysing earlier years.

Common buckwheat uses an 85-day project calendar, preserving the spring-cereal phase proportions
after scaling and rounding to 13/16/38/18 days. This uses the upper end of the cool-region
55–85-day seed-maturity reference in [FAO EcoCrop record 2285](https://ecocrop.apps.fao.org/ecocrop/srv/en/cropView?id=2285).
Its 15 May start and individual phase boundaries are assumptions; Tartary buckwheat and green
manure are not included. Strawberry retains the **1998** Table 12/22 parameters: Kc
0.40/0.85/0.75, roots 0.2–0.3 m and p 0.20. Its project 20/30/120/40-day canopy season starts
1 April and assumes an established open-field stand. It does not model tunnels, plastic mulch,
repeat-bearing varieties, post-harvest leaf cutting or regrowth. Water use is not stopped simply
because fruit harvest has ended, and berry-bush root depths are not borrowed.

Model availability is derived in the domain from each explicit mapping and its phase sources.
Own-species/use parameter references with own-species phase examples receive `species-reference`;
borrowed species/use parameters or project-adapted phases receive `approximate`; absent profiles
receive `environment-only`. Non-Polish references remain uncalibrated even in the first category.
`GET /api/crops` maps this to a strict, complete and unique 679-entry transport response. The web
picker consumes it with TanStack Query and shows the category before analysis, including for URL
and ARiMR-supplied choices. A failed lookup is unknown availability with retry, not an unsupported
crop. Labels describe reference quality, not parcel-specific confidence or a guarantee that an
analysis will be complete.

The broad ARiMR crop catalog remains selectable, but a catalog entry is not automatically mapped
to the nearest profile. Stage 2 exposes the following exact, reviewed identifiers; the lookup does
not use labels, fragments, or fuzzy similarity:

| ARiMR identifier           | Domain profile |
| -------------------------- | -------------- |
| `burak-cukrowy`            | `sugar-beet`   |
| `kukurydza-na-ziarno`      | `grain-maize`  |
| `pszenica-zwyczajna-jara`  | `spring-wheat` |
| `pszenica-zwyczajna-ozima` | `winter-wheat` |
| `rzepak-ozimy`             | `rapeseed`     |
| `ziemniak`                 | `potato`       |

These six pilot mappings are supplemented by the explicit species/group mappings in
`packages/analysis/src/additional-crop-water-profiles.ts` and the owner-authorized group estimates
in `packages/analysis/src/estimated-crop-profile-mappings.ts`. Lookup remains an explicit identifier
snapshot; no label, fragment or fuzzy matching runs in production. An unknown identifier still
returns `null` and is rejected by the API catalog schema.

### Group estimates when species references are missing (2026-11-22)

The owner's request changes the previous policy of stopping for absent species FAO parameters.
All 678 plant/vegetation catalog entries now have a reference or estimated model; mushrooms remain
environmental-only because they have no plant root zone. Original numeric profiles and mappings
are preserved. The 522 new assignments use existing group analogues or nine explicit project
envelopes in `estimated-crop-profiles.ts`. These are modelling assumptions, not additional FAO
species rows or field measurements. There are 58 species references and 620 approximate mappings.

FAO-56 (1998), Chapter 6, Table 12 describes similar coefficients within crop groups and seasonal
averaging of cutting effects. Chapter 8, Table 22 supplies root-depth/depletion references.
The new profiles identify each reference family and the project envelope separately:

| Estimate                  | Kc initial / mid / late         | Roots (m) | p at 5 mm/day | Assumed start; phase days |
| ------------------------- | ------------------------------- | --------- | ------------- | ------------------------- |
| Annual forage legume      | 0.4 / 0.9–1.15 / 0.5–0.85       | 0.3–1.0   | 0.50          | 1 Apr; 20/30/60/30        |
| Legume seed use           | 0.4 / 0.5–1.15 / 0.3–0.5        | 0.3–1.0   | 0.50          | 1 Apr; 20/35/65/30        |
| Established forage legume | 0.4 / 0.9–1.2 / 0.85–1.1        | 0.6–2.0   | 0.50          | 1 Apr; 20/30/130/30       |
| Grass/pasture             | 0.3–0.95 / 0.75–1.05 / 0.75–1.0 | 0.5–1.5   | 0.60          | 1 Apr; 20/30/130/30       |
| Herbaceous canopy         | 0.3–0.6 / 0.85–1.15 / 0.5–1.1   | 0.3–0.8   | 0.40          | 15 Apr; 20/35/95/30       |
| Mixed stand               | 0.3–0.5 / 0.9–1.2 / 0.4–1.0     | 0.5–1.5   | 0.50          | 1 Apr; 20/30/70/30        |
| Summer cover/green manure | 0.3–0.5 / 0.9–1.15 / 0.85–1.0   | 0.3–1.0   | 0.50          | 25 Jul; 15/25/35/15       |
| Overwintering cover       | 0.4–0.7 / 0.9–1.15 / 0.85–1.0   | 0.3–1.5   | 0.50          | 15 Sep; 160/75/40/20      |
| Unspecified vegetation    | 0.3–0.95 / 0.3–1.05 / 0.3–1.0   | 0.2–1.5   | 0.60          | 1 Apr; 20/30/130/30       |

The annual-legume root envelope is additionally informed by [IOR-PIB's serradella methodology
(2018), pp. 21–22](https://www.ior.poznan.pl/plik,3687,metodyka-integrowanej-ochrony-seradeli-siewnej-dla-doradcow-pdf.pdf),
which describes roots around 0.3–0.4 m on poor soils and about 1 m on fertile soils. Berseem forage
coefficients/p are a group transfer, not measured serradella parameters. The seed model brackets
alfalfa-seed and clover/pulse reference canopies. Herbaceous/ornamental estimates use a broad
mint/leafy-vegetable canopy analogue; woody cover borrows the orchard reference as an analogy,
without asserting orchard management or species-specific water requirements. Hemp cultivars use
a disclosed flax/fibre analogue, never the unrelated species called sunn hemp.

Every phase allocation and start in the table is a project assumption. A green-manure label
defaults to a summer cover crop; an overwintering label defaults to autumn establishment. Neither
establishes actual sowing, termination, cuts or regrowth. Mixtures are a generic stand envelope,
not an inferred species composition or weighted average. Fallow/nature labels assume vegetation
and cannot establish bare-soil evaporation. Perennial models still use a reference seasonal root
development rather than observed stand age. These limitations can dominate a day-specific result.

Both APIs use the same resolver and require `crop.modelKind`. Approximate results receive a visible
notice in current and historical sections and print; source details retain the profile and full
assumptions. Complete calculation means complete input/scenario processing, not validated crop
parameters. Scenario ranges remain sensitivity envelopes without assigned probabilities. Missing
weather or soil still prevents or limits calculation and is never filled with invented values.

The post-season behaviour and extended crop coverage are project choices introduced on
2026-11-22 following the user's missing-result examples, not organizer requirements or validation
against field moisture observations.

## FAO-56 decision rules and ambiguity

The core scenario ensemble includes every plausible combination retained for field capacity,
initial depletion, crop-stage parameters, and rooting depth. The unrounded `Ks` value determines
whether an individual scenario shows FAO-56 stress: `Ks = 1` means no modelled stress and `Ks < 1`
means stress-limited evapotranspiration.

| Core scenarios                                           | FAO-56 balance result                 |
| -------------------------------------------------------- | ------------------------------------- |
| all show `Ks = 1`                                        | `no-significant-shortage-indications` |
| all show `Ks < 1`                                        | `elevated-shortage-risk`              |
| any plausible scenario shows stress and another does not | `indeterminate`                       |
| a required core scenario cannot be calculated            | `insufficient-data`                   |

Scenario disagreement is never promoted to elevated risk by majority vote or by selecting the
more alarming field-capacity definition. `Indeterminate` means that sufficient inputs exist to
calculate plausible alternatives but those alternatives conflict. A conflicting satellite signal
is represented separately and does not change this status. `Insufficient-data` means that a
required input or scenario is missing or invalid. Comparisons at
the `Ks` boundaries use a numerical tolerance of `1e-9`; reported values are not rounded before
classification.

The strict domain classification remains unchanged so that a missing required scenario is never
silently promoted to a complete FAO-56 conclusion. The API now adds an interpretation level above
that strict result:

- `full-fao56` when every generated scenario is complete and agrees;
- `assumption-dependent` when every scenario is complete but conclusions disagree;
- `limited-fao56` when at least one scenario is complete and at least one required family is not;
- `weather-context-only` when no crop-water balance can be completed but at least one complete
  weather day remains available;
- `unavailable` when even the limited context is unavailable.

For a limited result, complete scenarios and completeness grouped by phenology and field-capacity
family remain visible. A no-stress conclusion from the available scenarios is explicitly not
generalised to missing families.

The existing `strong-shortage-indications` literal and its related consensus/reason literals are
retained only for source compatibility and are not emitted by the Stage 2 assessment. Exact
`Ks = 0` is a physical endpoint, not a sufficient scientific definition of a separate severity
class. The engine therefore retains actual daily `Ks` values and reports contiguous stress
episodes, their duration, minimum `Ks`, potential and adjusted ET, and cumulative ET deficit
without inventing moderate-versus-strong thresholds. A later contract version may remove or
redefine the reserved literals after a validated duration or cumulative-deficit rule is accepted.

## Satellite consistency is a separate result

The FAO-56 balance classification is never changed solely by NDVI or NDMI. The satellite signal
uses cautious names: `pattern-compatible-with-shortage` or
`pattern-incompatible-with-shortage`, not proof or disproof of water stress. Its relation to the
balance is reported separately as `consistent-with-balance`, `conflicts-with-balance`, `neutral`,
`unavailable`, `not-qualified`, or `not-comparable`. A conflict sets an interpretation limitation
but does not turn a resolved FAO-56 balance into `indeterminate`.

Satellite support must pass the existing observation-quality and age checks and must be
compatible with crop season and phenology. The implemented qualification requires a sufficient
NDMI observation no more than 14 days before the analysis date, at least four observations in the
Mann-Kendall/Theil-Sen trend, and every observation used by that trend to fall inside the
mid-season window of every active phenology scenario. A significant decreasing trend is only
`pattern-compatible-with-shortage`; a significant increasing trend is
`pattern-incompatible-with-shortage`; no significant direction is `neutral`. Any age, quality,
sample-size, or phenology failure remains `not-qualified`. A single raw NDMI/NDVI value, normal
senescence, or an unqualified trend is not supporting evidence. Satellite data cannot by itself
create, remove, or strengthen a shortage classification.

## Recommendation rules are screening decisions

The recommendation engine consumes only validated summaries already returned by the water,
SoilGrids, terrain, hydrology, and land-use analyses. It selects no more than four actions and
returns stable action identifiers, category, priority, evidence values, missing inputs, and
required verification. It does not use an LLM and does not select a location for a pond, ditch,
weir, or other structure.

Agronomic soil-cover and organic-matter actions require mapped agricultural land use and either a
modelled water limitation or, at low priority, a resolved no-stress result. Terrain actions use a
project screening threshold of at least 1 degree typical slope or 2 metres elevation range. The
threshold only decides whether to show a field-review prompt; it is not an engineering design
criterion. A mapped water object intersecting the parcel or within 100 metres triggers inspection
of the existing network and an explicit legal check. Modelled stress plus available terrain may
trigger a survey for distributed retention opportunities, never an automatically placed device.
Scenario disagreement, missing core inputs, or satellite conflict prioritises field verification.

The practice rationale is consistent with FAO guidance on soil organic cover and USDA NRCS
guidance on contour farming. Any work affecting water retention, water use, a water device, or
flow conditions must be checked against the applicable Polish water-law procedure before action.

## IUNG reference role

IUNG's Agricultural Drought Monitoring System uses climatic water balance, soil categories,
crop-specific critical values, and defined reporting periods. Its thresholds belong to that
method and are not copied onto FAO-56 `Ks`, root-zone depletion, or precipitation-minus-ET0.

Validation should compare the occurrence and timing of modelled stress across crops, soil
conditions, regions, and reporting periods with published IUNG monitoring results. Agreement can
support plausibility at an aggregated scale; disagreement identifies cases for investigation.
It cannot prove parcel-level soil moisture because IUNG is not a parcel sensor and the methods,
spatial resolution, and inputs differ.

## Report-ready domain result

`packages/analysis` exposes `simulateFao56Season`, whose deterministic result can be mapped by a
later API use case without making the domain depend on HTTP. It contains:

```ts
type Fao56SeasonEngineResult = {
  status: "complete" | "indeterminate" | "insufficient-data";
  balanceAssessment: Fao56BalanceAssessment;
  scenarios: readonly Fao56ScenarioResult[];
  spread: ScenarioResultRanges;
  initialConditionConvergence: InitialConditionConvergence;
  limitations: readonly Fao56Limitation[];
};
```

Each scenario exposes its phenology, parameter endpoints, field-capacity definition, initial
condition, wetting time, full daily trace, stress episodes, issues, and totals. The overall result
preserves input assumptions, ranges across complete scenarios, and measured convergence between
paired wet and dry starts. Stable classification and reason codes support later report copy. A
future transport DTO must additionally carry provider provenance and retrieval dates. No public
HTTP contract is introduced in Stage 2.

## Stage 3 API orchestration

`POST /api/analyses` accepts a parcel identifier or point, an ARiMR crop identifier, one analysis
date, and optional explicit scenario settings. A crop-specific assessment uses:

- the project-standard season start when phenology is omitted;
- `fao56-reference` with one or two caller-supplied season start dates; or
- `explicit-scenarios` with complete phase durations, start date, initial root depth, source, and
  description.

With an unsupported crop, unavailable reference durations, or a date before the modelled season,
the API fetches analysis-day context and returns `insufficient-data`.

After **all** supplied/reference variants have ended, the primary response still evaluates the
requested date. It returns `insufficient-data` for crop stress and an independently retrieved
30-day atmospheric context ending on that date. `completedSeason` separately holds the balance
through the last common modelled crop day, with its own `scope: completed-season` and
`evaluatedThroughDate`. Its classification cannot be interpreted as current crop stress.
A partly active ensemble is not truncated: ended alternatives remain incomplete required
variants. Disjoint seasons with no common modelled day are not moved.
Historical comparisons shift this evaluated period into the preceding ten years. Recommendations
for a fully calculated completed period use consensus about **any stress in that period**, rather
than treating a recovered final day as proof that the period had no stress. Satellite observations
for the requested day are not compared with a retrospective crop balance. Useful calculated
historical subsets remain visible with scenario counts, but do not enter complete-year frequencies.

After parcel lookup, weather, soil, and an explicitly requested satellite summary are fetched in
parallel. Satellite failure does not block the balance and the existing satellite observations
remain `not-qualified` for shortage consistency; they do not change the FAO-56 classification.
SoilGrids Q0.50 percentages are divided by 100 into volumetric fractions for all six layers. A
missing required water value makes the corresponding scenarios incomplete.

The central balance requests only `wv0010`, `wv0033`, and `wv1500`; texture, pH, carbon, and bulk
density remain available through the full soil-profile endpoint but cannot block FAO-56. Property
requests are coalesced and cached in memory for 24 hours. Complete source properties are also
persisted in PostgreSQL by exact sampled location and property, with product, version, resolution,
unit, retrieval time, and source URL. Immutable cached properties have no short TTL and remain
usable when WMS is unavailable; partial and failed responses are not persisted. A missing deep
layer affects only scenarios whose root zone intersects it. Network failures, timeouts, HTTP 429,
and 5xx responses receive at most one retry; a bounded delay honours `Retry-After` when supplied.
An empty WMS feature response is represented as `no-data`; it is neither a provider failure nor a
zero water content.

Weather diagnostics distinguish a trailing date absent from the provider response, an internal
missing date, and a date present with a missing variable. Provider attempts separately expose rate
limiting, timeout, request failure, and invalid response mapping. HTTP 429 is therefore never
described as scientific absence. The latest suggested analysis date is the end of the continuous
complete prefix from the required season start, not merely the last isolated available day.

Parcel lookup starts with the documented ULDK HTTPS endpoint. Because the live service can return
an invalid redirect that drops the query for generic clients, the adapter sends an identifying
application user agent and does not follow redirects automatically. It may retry the same public,
non-personal parcel query over HTTP. Both attempts retain an explicit timeout and propagate caller
cancellation.

The operational assumptions are explicit: daily `p` adjustment is enabled, and unobserved runoff,
irrigation, and capillary rise are set to zero with a rainfed/full-infiltration limitation. The
response includes stable reason and limitation codes, provider metadata, scenario configurations,
stress episodes, ranges, convergence, and measured orchestration/simulation times. These ranges
are scenario envelopes, not statistical confidence intervals; cumulative ET limitation is not a
yield-loss estimate.

## Historical susceptibility API

`POST /api/historical-analyses` is an additive endpoint. It requires a parcel, supported crop, and
analysis date. When explicit phenology is omitted, it uses the same project-standard season start
as the central assessment. The report calls it independently and presents the result immediately
after the current water-situation assessment.

For an analysis in year `Y`, the endpoint plans reference seasons `Y-1` through `Y-10`; the
analysis year itself is excluded. The analysis date and every resolved season start are
shifted by the same number of whole calendar years. This preserves a winter season's relationship
across a year boundary. If 29 February has no equivalent in a target year, it is deterministically
clamped to 28 February. The response always reports the actual start and end of every attempted
season, so this adjustment is not hidden.

Each season requests one continuous daily weather range from its earliest active phenology start
through its historical analysis date. Open-Meteo is attempted first. An incomplete or failed
Open-Meteo range may be replaced by a more complete request for the same entire range from NASA
POWER. When both responses are partial, the response with more days containing both precipitation
and ET0 is retained; providers are never spliced within a season. The API reports every missing
date, whether precipitation or ET0 is missing, and the last date for which the series is complete
without an earlier gap. At most three seasons fetch weather
concurrently. Open-Meteo ERA5-Land is documented from 1950; NASA POWER daily UTC/LST data are
documented from 1981-01-01 to near real time, so both cover the approximately twenty-year archive
needed by the oldest currently selectable product dates. Availability for a particular request is
still verified from returned daily continuity rather than inferred from nominal archive coverage.

The representative parcel point and one current SoilGrids profile are resolved once and reused
for all ten simulations. This profile represents relatively persistent modelled properties, not
historical moisture or proof that soil and land use did not change. A missing weather day, missing
precipitation, missing ET0, or required missing soil value makes the affected scenarios
incomplete. One failed season does not turn the endpoint into an HTTP error: the overall result is
`complete`, `partial`, or `insufficient-data` according to the number of scientifically complete
seasons.

For each complete season, the response retains the scenario count, agreement, stress-day range,
the range and maximum of the longest contiguous episode, the range and minimum of minimum `Ks`,
final `Ks`, and the cumulative ET-deficit range. A season is
`modelled-stress` only when every complete scenario contains at least one stress day during the
analysed period, `no-modelled-stress` only when none does, and `ambiguous` when plausible scenarios
disagree. This period conclusion is separate from the final-day conclusion derived from final
`Ks`. Missing seasons are
never counted as no-stress seasons. Every occurrence ratio carries its actual complete-season
denominator. The ten-year median is a range formed from the medians of the per-season minimum and
maximum stress-day counts; it is not a confidence interval.

Recurrence uses the same all/none/disagreement rule for each growth phase and each day from season
start. It separately reports seasons with robust stress across all scenarios, seasons whose result
depends on assumptions, and seasons without modelled stress. Phase metrics are calculated inside
each scenario's own phenology dates before aggregation. Wet and dry initial-condition scenarios
are paired while holding every other configuration value constant; stress appearing only in the
`Dr = TAW` member is explicitly marked as dry-start-only sensitivity rather than historical
evidence. Pair agreement compares stress-day count, longest episode, and cumulative ET deficit.
The aggregation also records whether and on which modelled day both initial-condition variants
first reach the same root-zone depletion and `Ks` within the engine's numerical tolerance. It does
not discard early days or choose either initial state as the true historical state.

Scenarios have no probability weights. Their minimum and maximum form a sensitivity range, not a
confidence interval. The response does not rank years using a scenario median and the interface
does not present a median scenario as the most likely outcome.

The report section is named "Uprawa na tle poprzednich lat" and leads with one interval-bar chart
of modelled stress days. Selecting a year reveals its actual date range, stress-day and ET-deficit
ranges, longest-episode range, scenario agreement, data completeness, and initial-condition
sensitivity. Missing years keep their position and are never rendered as zero.

The result is counterfactual: it asks how the currently selected crop profile and declared
phenology would behave under past weather. Historical crop rotation is not confirmed; current
parcel geometry and current SoilGrids are reused; historical irrigation, runoff, and capillary
rise are unknown. The endpoint therefore reports modelled susceptibility, not confirmed field
history or historical losses. It does not use satellite observations, so no post-event satellite
data can enter a historical result.

## Automated verification

Automated tests cover:

- TAW and RAW using all four selected rows from FAO-56 Example 36;
- `Ks`, `ETc,adj`, and the ten-day recursive depletion sequence from FAO-56 Example 37;
- early-day precipitation, excess irrigation drainage, and growing root depth from Example 38;
- early- versus late-day wetting order, `0 <= Dr <= TAW`, and numerical boundary tolerance;
- SoilGrids stored-unit conversion to volumetric percent and layer millimetres;
- adjustment of `p` for daily potential ETc and physical bounds;
- exact pilot profile parameters and explicit non-Polish status of duration references;
- all decision branches, including regression assertions that scenario disagreement is
  `indeterminate`, satellite conflict remains separate, and satellite support does not promote
  the FAO-56 class;
- complete spring and winter seasons, including a calendar-year boundary;
- drought episodes where `Ks` remains positive, intense rainfall and drainage, growing root
  zones, both field-capacity variants, both initial states, and unknown wetting time;
- multiple sowing-date scenarios, all six crop profiles, missing weather and soil inputs, exact
  ARiMR mapping, daily mass conservation, and physical depletion bounds.
- ten-year planning, winter seasons, the 29 February clamp, complete and unavailable years,
  denominator handling, period-versus-final-day conclusions, initial-condition sensitivity,
  episode and phase recurrence, and input-order stability;
- historical API fallback, provider non-splicing, timeout/429 provenance, partial results,
  unsupported crops, and required explicit phenology.

These tests establish faithful implementation of the cited equations and decision policy. They
are not scientific validation against observed Polish field moisture or crop response.

## Live-provider validation on 2026-11-22

The production adapters were exercised for parcel `141201_1.0001.6509`, using a representative
point near 21.55° E, 52.15° N. This is an operational check, not scientific validation.

- For winter wheat from 2026-09-15 through 2026-11-21, Open-Meteo returned HTTP 429. NASA POWER
  returned precipitation for 66 of 68 days but insufficient inputs to calculate ET0 for all 68
  days; 2026-11-20 and 2026-11-21 also lacked precipitation. The API therefore returned
  `insufficient-data` and exposed every missing date and field. It did not substitute zeros.
- For spring wheat from 2025-03-20 through 2025-06-30, NASA POWER returned a complete 103-day
  series after the Open-Meteo 429 response. This confirms that whole-range fallback works for a
  historical date without provider splicing.
- The ten analogous periods from 2015 through 2024 each returned 103 of 103 weather days from
  NASA POWER. Weather retrieval and historical orchestration completed in 4.48 seconds.
- The live SoilGrids WMS request was unavailable during both checks. Consequently the central and
  historical endpoints correctly remained `insufficient-data`, and no production FAO-56 result
  was claimed. The complete-weather central request finished in 10.30 seconds; the recent-date
  request finished in 5.17 seconds.

The Open-Meteo 429 response prevents this run from determining whether ERA5-Land publication lag
also affected 2026-11-21. NASA POWER explicitly represented the unavailable values with its
`-999` fill value; the adapter mapped those values to `null`. A future successful Open-Meteo
request is required to distinguish provider rate limiting from archive publication delay for that
specific date.

## Functionality repair validation on 2026-11-22

The reported failure was reproduced for parcel `280903_2.0009.1/25`, Kotowo, Lidzbark Warmiński.
ARiMR GSA suggested winter rapeseed over 96.27% of its area, but its empty phase-reference list
prevented both the central and historical simulations. Independently, the configured standalone
ERA5-Land requests returned null precipitation/ET0 and the original Overpass instances were
unavailable. These were data and model-configuration failures, not just presentation problems.

After the corrections:

- For winter rapeseed on 2026-11-21, ERA5 provided a complete prefix only through 2026-11-16.
  A whole-season ECMWF IFS alternative supplied all 94 required daily records. All 64 FAO-56
  variants completed; the model showed no current restriction of water uptake. The date stayed
  2026-11-21. An API run took 5.68 seconds, with process-local caches potentially contributing.
- The ten preceding rapeseed seasons completed independently. Their period results remained
  assumption-dependent, which is a calculated sensitivity result rather than missing data.
- The Europe Overpass instance returned real hydrology and land-use geometry. The derived
  nearest ditch distance was about 12.7 m and mapped agricultural coverage about 94.9%.
  This restored evidence for retention and agronomic recommendations.
- The browser was exercised with the requested date, source details, the historical year
  selector, retry after a controlled HTTP 503, and a 390-pixel viewport. Missing inputs were not
  replaced with zeros, fixtures, or an unannounced date change.

Other live checks covered `141211_2.0038.102` (spring wheat, 2025-06-30),
`302108_5.0014.88/8` (grain maize, 2024-07-15), and `060506_5.0004.176` (potato,
2023-07-15), plus the oldest selectable date, an ended phenology alternative, and incomplete
recent weather. These checks validate integration and report behavior, not scientific accuracy
against measured field moisture or observed crop losses. The database was unavailable, so
persistent-cache behavior was not validated in the live run.

Additional browser checks for `280803_2.0024.149/4` with bobik and requested date 2026-11-21
returned all 16 required balance scenarios and 10 complete historical periods. The actual
reference period was 2026-03-25 through 2026-07-02, explicitly labelled as completed-season
context. Four actions were derived with complete spatial context; during a later transient
Overpass outage, available NMT and water evidence still yielded partial recommendations.
The UI was exercised at 1440 px and 390 px, including year selection and retry controls.
In the final browser pass, complete spatial context and four bobik actions were recovered after
two explicit retries (36.6 seconds including retries); Kotowo recovered three actions after one
retry (11.6 seconds). Earlier successful bobik responses took 2.75 seconds with warm source caches.
The preferred 30-second response is therefore not guaranteed during public-provider outages.

A complete no-stress balance plus unavailable land-use/hydrology data previously yielded an
empty recommendation array. It now yields an explicit field-verification action with
`incomplete-inputs` evidence. This does not invent a mapped water object or agricultural class.
Successful terrain grids have a separate application cache policy (30 minutes, exact bounds and
resolution, maximum 128 samples), preserving provenance and excluding failures. Retrying a
missing independent source can therefore retain an already retrieved NMT sample.

The deterministic suite includes regression coverage for crop mappings, completed-season periods,
established perennial roots, and recommendation composition. Typechecking and production builds
were checked separately. Repository-wide `pnpm check` was blocked by a pre-existing formatting issue in
`.impeccable/critique/2026-11-21T17-28-56Z__ures-satellite-history-satellitehistorysection-tsx.md`;
application and maintained-documentation lint was run separately.

## Sources

- [FAO Irrigation and Drainage Paper 56, Chapter 6](https://www.fao.org/4/X0490E/x0490e0b.htm):
  crop stages, stage-duration examples, and crop coefficients in Tables 11 and 12.
- [FAO Irrigation and Drainage Paper 56, Chapter 8](https://www.fao.org/4/x0490E/x0490e0e.htm):
  Equations 80–88, Tables 19 and 22, and Examples 36–38.
- [IUNG Agricultural Drought Monitoring System — method](https://susza.iung.pulawy.pl/system/),
  [soil categories](https://susza.iung.pulawy.pl/kategorie/),
  [crop thresholds](https://susza.iung.pulawy.pl/progi/), and
  [reporting periods](https://susza.iung.pulawy.pl/raporty/): external validation reference.
- [ISRIC SoilGrids FAQ](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html):
  model resolution, prediction uncertainty, depths, and water-content properties.
- [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api):
  ERA5/ERA5-Land archive coverage, daily variables, and API semantics.
- [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/): daily
  UTC/LST coverage from 1981-01-01 to near real time and request limits.
- [Agricultural Advisory Centre — Agricultural Production Standards](https://poznan.cdr.gov.pl/normatywy/):
  central-Poland sowing and planting periods used to define the project-standard season starts.
- [FAO soil organic cover](https://www.fao.org/conservation-agriculture/in-practice/soil-organic-cover/en/):
  soil-cover effects and the need to adapt cover crops to the production system.
- [USDA NRCS Contour Farming 330](https://www.nrcs.usda.gov/sites/default/files/2022-09/Contour_Farming_330_Overview_Oct_2017.pdf):
  contour-farming purpose, planning context, and the need for proper design.
- [Wody Polskie — water-law permit](https://www.gov.pl/web/wody-polskie/pozwolenie-wodnoprawne):
  activities and water devices that may require a permit.

Additional phase-calendar sources:

- [INRAE CropWat parameter provenance](https://umr-g-eau.pages-forge.inrae.fr/cropwat/reference/crop_params.html)
  and [published CropWat package](https://inrae.r-universe.dev/CropWat), version 0.3.0.
- [Jankowski et al. (2024), NE Poland winter-rape seasons](https://doi.org/10.3390/agronomy14030437), Table 2.
- [European soil-improving cropping systems modelling](https://doi.org/10.3390/land11060943):
  reference crop calendars stretched to planting and harvest periods, supporting this as a
  transparent screening technique rather than observed phenology.

## Current implementation boundary

The central and historical responses are connected to the report through separate TanStack Query
requests. They present classification, reason codes, source completeness, provenance, assumptions,
and limitations without exposing raw FAO-56 variables by default. The historical section reports
the actual complete-season denominator, ambiguous and unavailable years, and selectable annual
ranges of stress days, ET deficit, and episode length. Phase recurrence remains available in the
API. Annual counts are not probabilities or a new severity class. Automatic
standard dates, unsupported crops, missing phase durations, partial inputs, scenario disagreement,
and technical errors remain distinct states; other report sections load independently. The
implementation does not provide regionally calibrated Polish growth-stage durations.
Recommendation cards are generated from the analysed context and show their evidence, missing
inputs, and verification needs; they remain screening guidance rather than designs or guaranteed
outcomes. All later work must preserve both field-capacity definitions, missing-data semantics,
explicit assumptions, scenario disagreement, and the separation of satellite observations from
the FAO-56 balance.

### Explaining assumption-dependent results

The central report shows scenario outcomes beside an assumption-dependent assessment. It groups
completed scenario results by initial water state, field-capacity definition, root depth, wetting
time and phase calendar. Varying crop-coefficient and initial-root assumptions are also available
in the comparison details. Each group reports its own stress-day range and whether the engine's
stress episodes reach the actual evaluated end date. Incomplete simulations are excluded from
ranges and counted explicitly; absence is not displayed as zero stress. Other assumptions vary
within each group, so these are conditional ensemble ranges, not isolated causal effects,
probabilities, or field measurements. The explanation also applies to completed-season results.

## Requested-date and recommendation follow-up (2026-11-22)

The owner requested addressing audit findings 2, 3 and 4. The API uses Europe/Warsaw for the
current-day boundary. `getContinuousWeather` excludes ongoing-day totals, even if a source returns
numbers. When a longer request ends today, providers are queried only through yesterday, while
normalization retains today's explicit missing record. This avoids treating a forecast or partial
daily total as an observation. Earlier complete dates require an explicit user action.

`requestedDateConditions` summarizes a 30-day inclusive window ending on the requested date,
including leap days. The same continuous weather series is reused when it covers that window;
otherwise a separate concurrent request uses the existing whole-range provider policy. Rainfall
and ET0 have independent coverage, and their totals require all 30 values. P minus ET0 is available
only when both totals are complete. Its sign describes atmospheric supply versus reference
atmospheric demand; it is not soil storage, crop stress, a calibrated drought threshold or an
irrigation dose. The 30-day window is a disclosed project choice. A failed current-context request
does not erase a valid completed-season result or allow it to stand in for the requested date.

Crop identity now reaches the recommendation domain. Existing reviewed profile mappings determine
annual versus perennial applicability. Advice for standing annual crops avoids proposing a new
competing cover inside the crop; post-season advice concerns the interval between crops. Orchard,
vine, berry and hop profiles receive interrow guidance; other modelled perennial profiles receive
existing-cover guidance. These are conservative project applicability rules, not parcel-observed
phenology or a new calibrated agronomic model. Relevant primary references are
[FAO soil organic cover](https://www.fao.org/conservation-agriculture/in-practice/soil-organic-cover/en)
and [NRCS Cover Crop in Organic Systems](https://www.nrcs.usda.gov/sites/default/files/2024-07/cover-crop-in-organic-systems-rd.pdf),
particularly its section on perennial systems. Water competition and crop-management history
remain explicit matters for field/agronomic verification.

Retention locations use the source geometry of mapped water objects within the existing screening
distance. Terrain candidates are the lowest finite in-parcel sample and the cell with the greatest
finite central-difference slope, excluding parcel holes. These are sample-cell centers, with the
larger horizontal cell dimension reported as their resolution. A low sample may be a sloping
boundary rather than a depression; a high slope does not confirm runoff. Flat grids and grids
without usable parcel cells yield no candidates. These screening positions appear as numbered
map features and action references. Selecting an action's place opens the map, focuses that
source geometry and highlights its number; the full-parcel control restores the overview.
No storage volume, flow path, construction site or legal
permission is inferred. Recommendations without a supported location remain partial.

Deterministic regressions cover today's incomplete totals and the Polish/UTC midnight boundary,
requested-day versus seasonal weather, independent current-weather failure, crop applicability,
actual water geometry, missing targets, flat terrain, holes, and the corresponding report states.
