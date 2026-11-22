# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a Polish farmer without specialist GIS, remote-sensing, or hydrology
knowledge. The user selects a cadastral parcel, crop, and analysis date to understand water
conditions and practical retention factors.

## Product Purpose

HydroPlon combines verified environmental and geospatial data into a transparent
parcel-specific assessment. Success means that the user can recognize the parcel, understand the
evidence and uncertainty, and act on recommendations without mistaking modelled data for field
measurements.

## Positioning

The product connects each conclusion to a specific parcel, source date, calculation, and stated
limitation instead of presenting generic agricultural advice.

## Operating Context

The prototype is evaluated in a desktop browser for parcels anywhere in Poland. A normal workflow
starts with parcel selection through GUGiK ULDK, continues with crop and date selection, and ends in
a report that combines independently retrieved evidence. Mobile support is beneficial but not a
replacement for the desktop workflow.

## Capabilities and Constraints

- Parcel geometry comes from GUGiK ULDK and uses GeoJSON WGS84 at system boundaries.
- Analysis must support current and historical dates from the previous ten years.
- Terrain, hydrology, land use, weather, satellite observations, and soil data must remain
  distinguishable sources with their own completeness and limitations.
- Results and recommendations must be calculated from source data. Fixtures are test-only or an
  explicitly labelled development mode.
- Missing data must remain visible and must not be converted to zero or fabricated precision.
- A realistic parcel terrain view uses actual NMT elevations and orthophotography; it must not add
  procedural landscape objects or vertical exaggeration.
- The target response time for one parcel is 30 seconds.
- Exact analytical thresholds, final providers not already decided in
  `docs/product-requirements.md`, and report persistence remain open product decisions.

## Brand Commitments

The product name is HydroPlon. User-facing copy is plain, factual Polish written for a
farmer. The interface should feel like a trustworthy agricultural field instrument rather than a
game, laboratory elevation map, or promotional dashboard.

## Evidence on Hand

- Maintained requirements: `docs/product-requirements.md`.
- Parcel boundaries: GUGiK ULDK.
- Existing public-data integrations and their provenance are documented in `README.md`.
- No field measurements, user testimonials, or verified retention outcomes are available and none
  may be fabricated.

## Product Principles

- Prefer a smaller defensible result to a more impressive unsupported claim.
- Keep source, date, resolution, completeness, and uncertainty next to the conclusion they qualify.
- Use the parcel and its real surroundings as the unit of explanation.
- Separate deterministic analysis from presentation.
- Keep partial results useful without hiding missing evidence.

## Accessibility & Inclusion

The core workflow must support keyboard operation, semantic controls, visible focus, readable
contrast, reduced motion, touch interaction, and explicit loading, empty, partial, and error states.
