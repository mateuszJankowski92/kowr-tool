# Implementation re-audit — 22 November 2026

## Scope and verdict

This re-audit supersedes the previous audit snapshot. It checks the current working tree,
[maintained competition requirements](product-requirements.md), deterministic checks, and the
running local API with real providers. Report preservation is an acknowledged owner-known gap
and was excluded from the new findings. Application code was not changed during this review.

All major analytical modules and all seven required data categories are present. Crop-aware
recommendations now reference real water geometry and sampled terrain inspection places. The
primary response retains the requested date and separates the completed crop season.

Complete competition compliance is still not demonstrated: current-day and off-season crop
assessments remain limited, many selectable crops have no analytical profile, scientific
validation and formal submission readiness are unconfirmed, and one report-status label
misrepresents uncertainty as missing data. These are distinguished below from implemented paths
and optional extensions. Unknown organizer interpretations are not resolved by this audit.

## Findings excluding report preservation

1. **F-05 / F-07 — current-day assessment remains partial.** Today's date is selectable and
   future-date validation uses the Polish calendar. However, `get-continuous-weather.ts:65`
   deliberately excludes the ongoing day's precipitation and ET0 totals. A complete daily
   FAO-56 result cannot be produced for that date. The real current-day check returned
   `insufficient-data`, with the complete prefix ending on 2026-11-21 and both inputs missing
   for 2026-11-22. This is transparent and avoids treating unfinished daily data as observations;
   it is not evidence of a complete assessment for today. The earlier repair completed the
   input path, not the full analytical coverage of F-05/F-07.
2. **F-07 — off-season results provide weather context, not current crop water stress.** The
   response correctly preserves the requested date and moves the previous crop balance into
   `completedSeason`. For bobik on 2026-11-21, the real response had complete 30-day weather
   context but `balance.classification = insufficient-data`. Sixteen seasonal scenarios were
   calculated separately through 2026-07-02. Date substitution is fixed; water-stress assessment
   on every possible requested date is not established. No inactive crop or unknown current
   cover should be extrapolated silently.
3. **F-13 / N-01 — ambiguous recommendations are labelled as missing data.**
   `RecommendationsSection.tsx:430` maps every recommendation status other than `complete` to
   “Część danych”. The domain marks an indeterminate water assessment as `partial` even when
   source data and locations are available (`recommendations.ts:319`). Reproduced with Kotowo,
   winter rapeseed, 2025-05-15: all 64 scenarios completed, all source categories were available,
   and recommendations had water/terrain locations, but the model's conclusions disagreed.
   The API correctly returned scenario-disagreement evidence. The UI label should distinguish
   missing sources, missing locations, and uncertainty caused by model assumptions. Browser
   rendering was not directly inspected; this UI behavior follows from the returned payload
   and the unconditional label mapping in the current component.
4. **Crop coverage and selection clarity.** At the time of this audit the exports contained 679
   selectable catalog entries, 132 mapped crop identifiers and 48 profiles. The subsequent
   [catalog extension](crop-catalog-review.md) raises coverage to 156 identifiers and 61 profiles.
   Unsupported entries correctly remain unsupported. The original selector did not identify this
   before analysis; the subsequent extension adds API-derived species-reference, approximate-model
   and environmental-only labels before selection and for the selected crop. The remaining
   coverage limits are recorded in the catalog review;
   the competition brief does not establish a compulsory list of all 679 crops (Q-06), so these
   counts alone do not prove a missing organizer requirement.
5. **Validation and formal readiness remain unconfirmed.** Numerical reference tests and live
   integration checks exist, but they do not validate parcel-level accuracy against measured
   Polish field moisture, crop response or the jury's references. No completed IUNG comparison
   was found. The scientific appendix and full original competition package were unavailable.
   No presentation PDF, demonstration video, team submission package or preserved generated
   report was found among repository artifacts; these may exist elsewhere. Repository privacy
   and jury access were not checked. README/methodology describe architecture and sources, but
   a complete component/license/AI-tool inventory and consolidated source-limit, scaling,
   hosting-cost and alternative plan were not found.

The optional date-range extension still passes only the end date to the central assessment,
recommendations and satellite summary; weather evidence receives both boundaries
(`ReportPanel.tsx:220`). This is a project consistency issue, not an additional organizer minimum.

## Current requirement coverage

| Requirements                                                           | Current evidence and status                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01–F-03: web workflow and parcel selection                           | Implemented; map selection and full cadastral identifiers, with national ULDK/WFS providers. The exact jury numbering format remains open.                                                                                                                                 |
| F-04: crop influence                                                   | Implemented for mapped crops; crop coefficients/roots/phenology affect the balance, and recommendation applicability distinguishes annual/perennial and season context.                                                                                                    |
| F-05: requested dates                                                  | Historical and current-day input paths exist; today's assessment remains partial as described above.                                                                                                                                                                       |
| F-06: national coverage                                                | No prepared-parcel allowlist or regional restriction found. Two parcels were checked live here; universal operational availability is not proven.                                                                                                                          |
| F-07: date-specific and multiyear results                              | Daily seasonal model and ten analogous seasons exist; current-day/off-season limits remain.                                                                                                                                                                                |
| F-08: source-derived calculations                                      | Deterministic calculations and conditional recommendation rules; no production fixture substitution found in the inspected paths.                                                                                                                                          |
| F-09–F-11: retention/agronomic actions and evidence                    | Crop-aware actions, source evidence, water geometry and NMT inspection locations implemented and exercised through the API. Inspection cells are not confirmed engineering sites.                                                                                          |
| F-12–F-13: report and uncertainty                                      | On-screen sources, dates, limitations and partial results exist; the recommendation-status label has the defect above.                                                                                                                                                     |
| D-01–D-07: required data                                               | Weather, Sentinel-2, SoilGrids, OSM hydrology, parcel geometry, land use and NMT have computational roles; all were available in the live historical-date check. Satellite observations were correctly marked unqualified for comparison with the balance's growth stages. |
| N-01–N-05: usability, browser operation and basic technical safeguards | Forms/asynchronous states, transport validation, safe errors and API-only secrets are implemented; farmer usability and the complete browser/Windows matrix are unverified. Local health reported a connected database.                                                    |
| N-06–N-08: source/component terms, scaling and costs                   | Partial documentation; see finding 5.                                                                                                                                                                                                                                      |
| N-09: preferred 30 seconds                                             | Individual measured API calls below were fast, with caches potentially contributing. No cold-start/end-to-end guarantee is established; earlier records include 36.6 seconds with retries. This is a preference.                                                           |
| N-10: mobile                                                           | Responsive implementation and prior 390 px checks are documented; not independently repeated here.                                                                                                                                                                         |

## Fresh live API evidence

Local API at port 3000 reported `status: ok` and `database: connected`. Requests used production
adapters; this review did not start Docker, seed the database, or import test fixtures. Existing
caches may have contributed. Real response payloads were inspected in temporary review files;
this is not an application report-preservation feature.

| Parcel / crop / date                                | Request                               | Observed result                                                                                                                                                                                      | HTTP duration |
| --------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `280903_2.0009.1/25` / winter rapeseed / 2025-05-15 | Central assessment, satellite enabled | 64 complete scenarios; assumption-dependent/indeterminate; real Open-Meteo, ISRIC and CDSE provenance. Selected satellite observation 2025-05-08, unqualified because of growth-stage comparability. | 4.11 s        |
| Same                                                | Historical assessment                 | Ten complete analogous seasons, reference years 2015–2024; actual data span 2014-08-20 through 2024-05-15.                                                                                           | 1.07 s        |
| Same parcel                                         | Terrain context                       | NMT, hydrology and land use available; two terrain inspection points, about 12.17 m sampled-cell size; 24 mapped water objects.                                                                      | 3.32 s        |
| Same parcel                                         | Full soil profile                     | Complete profile across six depths.                                                                                                                                                                  | 2.84 s        |
| Same historical analysis context                    | Recommendations                       | Three evidence-linked actions; actual OSM objects at about 12.7, 69.0 and 81.3 m, plus a sampled slope cell. `partial` reflected scenario disagreement, reproducing finding 3.                       | 0.004 s       |
| Same parcel/crop / 2026-11-22                       | Current-day assessment                | Incomplete current day; 94 complete preceding weather days; last complete assessment offered for 2026-11-21.                                                                                         | 1.68 s        |
| `280803_2.0024.149/4` / bobik / 2026-11-21          | Off-season assessment                 | Requested-date weather context complete; current crop stress unassessed; 16 computed seasonal scenarios separately through 2026-07-02.                                                               | 6.08 s        |

The historical analysis, full soil profile and terrain responses were parsed with the current
Zod contracts. The recommendation request was composed using the actual web application's
`createRecommendationContext` and validated before posting. A calculated indeterminate outcome
is not a provider failure or a fabricated drought result.

## Verification

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 490 tests in 74 files (194 domain, 148 API, 148 web).
- `pnpm build`: passed; existing large-chunk and third-party annotation warnings remain.
- `pnpm check`: attempted; stopped at formatting of the existing critique artifact in
  `.impeccable/critique/2026-11-21T17-28-56Z__ures-satellite-history-satellitehistorysection-tsx.md`.
- Chrome DevTools could not attach because its profile was already in use. No fresh visual,
  print, mobile or cross-browser check is claimed.

Only this audit document was updated during the re-audit. Existing application and working-tree
changes were preserved. The maintained product requirements were not marked fully implemented.
